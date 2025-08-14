// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Rng (Random Number Generator) Contract
 * @notice TODL 프로젝트의 난수 생성 컨트랙트
 * @dev 시드의 무결성을 검증할 수 있는 서명 기반 알고리즘 적용
 * 라운드 중간에 추가되는 엔트로피로 인해, 시드 생성자조차도 최종 난수값을 유추할 수 없음
 * even the seed generator cannot infer the final random value.
 * @author hlibbc
 */
contract Rng is EIP712, Ownable {
    using ECDSA for bytes32;

    // def. STRUCT
    /**
     * @notice 라운드별 기록될 Rng 정보
     * @dev 라운드의 난수 생성 과정에서 필요한 모든 정보를 저장
     */
    struct RoundRngInfo {
        address ender;      /// 라운드를 종료시킨 참여자
        uint256 blockTime;  /// 라운드 종료 블록 타임스탬프
        bytes32 salt;       /// Salt값: 라운드종료 블록의 50블록 이전 해시
        uint256 randSeed;   /// 최초 commit시 생성했던 random seed
        bytes32 finalRands; /// 최종 난수 (reveal 이후 확정됨)
        bytes signature;    /// 라운드 시작 시 입력된 RoundSeedInfo에 대한 signer 서명
    }

    // def. EVENT
    /**
     * @notice Signer 변경 이벤트
     * @param signer 변경된 Signer 주소
     */
    event SignerUpdated(address indexed signer);
    /**
     * @notice 라운드 커밋 이벤트
     * @param roundId 커밋된 라운드 ID
     */
    event Committed(
        uint256 indexed roundId
    );
    /**
     * @notice 엔트로피 시일링 이벤트
     * @param roundId 라운드 ID
     * @param ender 라운드를 종료한 주소
     * @param salt 생성된 salt 값
     */
    event SealedEntropy(
        uint256 indexed roundId,
        address indexed ender,
        bytes32 salt
    );
    /**
     * @notice 난수 공개 이벤트
     * @param roundId 라운드 ID
     * @param seed 시드 값
     * @param finalNum 최종 난수
     */
    event Revealed(
        uint256 indexed roundId, 
        uint256 indexed seed, 
        bytes32 finalNum
    );
    
    // def. CONSTANT
    uint256 public constant ENTROPY_FACTOR1 = 65; /// 첫 번째 엔트로피 팩터
    uint256 public constant ENTROPY_FACTOR2 = 69; /// 두 번째 엔트로피 팩터
    bytes32 public constant SIGDATA_TYPEHASH =    /// 서명 데이터 타입 해시
        keccak256("SigData(uint256 roundId,uint256 randSeed)");

    // def. VARIABLE
    address public mainAddr;    /// 라운드시작, 종료, 정산을 관장할 컨트랙트
    address public signerAddr;  /// commit 시 기록될 시그니처 주인

    mapping(uint256 => RoundRngInfo) public roundRngInfo; /// 라운드별 RngInfo 저장용 매핑변수

    /**
     * @notice Rng 컨트랙트 생성자
     * @param _mainAddr Main 컨트랙트 주소
     * @param _signer 서명자 주소
     */
    constructor(
        address _mainAddr,
        address _signer
    ) EIP712("Custom-Rng", "1") Ownable(msg.sender) {
        require(_mainAddr != address(0), "Invalid Main address");
        mainAddr = _mainAddr;
        signerAddr = _signer;
    }

    // def. MODIFIER
    /**
     * @notice Main 컨트랙트만 호출 가능하도록 제한
     */
    modifier onlyMain() {
        require(msg.sender == mainAddr, "Not Main contract");
        _;
    }

    /**
     * @notice Signer 주소 설정
     * @dev onlyOwner
     * @param _newSigner 새로운 Signer 주소
     */
    function setSigner(address _newSigner) external onlyOwner {
        require(_newSigner > address(0), "Invalid address");
        signerAddr = _newSigner;
        emit SignerUpdated(_newSigner);
    }

    /**
     * @notice 라운드가 시작될 때 "서명데이터"에 대한 서명을 저장
     * @dev 서명데이터 템플릿:
     * struct SigData {
     *    uint256 roundId;
     *    uint256 seed;
     * }
     * @param _roundId 라운드 ID
     * @param _signature 서명 데이터
     */
    function commit(
        uint256 _roundId, 
        bytes calldata _signature
    ) external onlyMain {
        require(roundRngInfo[_roundId].signature.length == 0, "Already committed");
        roundRngInfo[_roundId].signature = _signature;
        emit Committed(_roundId);
    }

    /**
     * @notice "라운드종료"시 엔트로피를 추가한다.
     * @dev 추가될 엔트로피 목록:
     * - ender (address: 20bytes)
     * - salt: keccak256(abi.encodePacked(block.timestamp, blockhash(selectedBlockNum)))
     *   -> selectedBlockNum은 50블록이전 블록해시 (총 블록이 50블록보다 작을경우, 1번블록 해시)
     * @param _roundId 라운드 ID
     * @param _ender 라운드를 종료한 주소
     */
    function sealEntropy(
        uint256 _roundId, 
        address _ender
    ) external onlyMain {
        require(_ender != address(0), "Invalid Ender address");
        require(roundRngInfo[_roundId].signature.length > 0, "Not committed Yet");
        require(roundRngInfo[_roundId].ender == address(0), "Already sealed");

        uint256 selectedBlockNum = (block.number > 50)? (block.number - 50) : (1);
        bytes32 salt = blockhash(selectedBlockNum);
        roundRngInfo[_roundId].blockTime = block.timestamp;
        roundRngInfo[_roundId].salt = salt;
        roundRngInfo[_roundId].ender = _ender;
        emit SealedEntropy(_roundId, _ender, salt);
    }

    /**
     * @notice "라운드정산"시 호출되며, "라운드시작" 시 생성한 랜덤시드를 공개한다.
     * @dev 랜덤시드와 추가 엔트로피들을 조합하여 최종난수를 생성한다.
     * @param _roundId 라운드 ID
     * @param _randSeed 랜덤 시드 값
     */
    function reveal(
        uint256 _roundId, 
        uint256 _randSeed
    ) external onlyMain {
        RoundRngInfo storage info = roundRngInfo[_roundId];

        require(info.finalRands == bytes32(0), "Already revealed");
        require(info.signature.length == 65, "Invalid signature length");

        // EIP-712 hash 생성
        bytes32 structHash = keccak256(abi.encode(
            SIGDATA_TYPEHASH,
            _roundId,
            _randSeed
        ));

        bytes32 digest = _hashTypedDataV4(structHash);

        // 서명 복원
        address recovered = ECDSA.recover(digest, info.signature);
        require(recovered == signerAddr, "Invalid signature");

        // 추가 entropy 생성
        bytes32 entropy1 = (block.number > ENTROPY_FACTOR1)? (blockhash(block.number - ENTROPY_FACTOR1)) : (bytes32(0));
        bytes32 entropy2 = (block.number > ENTROPY_FACTOR2)? (blockhash(block.number - ENTROPY_FACTOR2)) : (bytes32(0));

        // 최종 난수 생성
        bytes32 finalRng = keccak256(
            abi.encodePacked(_randSeed, info.ender, info.salt, entropy1, entropy2)
        );

        info.randSeed = _randSeed;
        info.finalRands = finalRng;
        emit Revealed(_roundId, _randSeed, finalRng);
    }

    /**
     * @notice 라운드의 Reveal 프로시져 무결성을 재현한다.
     * @dev 모두가 서명의 무결성을 확인할 수 있도록 하기 위함이다.
     * 해당 라운드의 Reveal 이후 호출 가능하다.
     * @param _roundId 라운드 ID
     * @param _randSeed 라운드 commit 시 생성한 랜덤시드값
     * @return 서명복원의 결과가 signer인지 여부 (boolean)
     */
    function recreateReveal(
        uint256 _roundId, 
        uint256 _randSeed
    ) external view returns (bool) {
        RoundRngInfo storage info = roundRngInfo[_roundId];
        require(info.signature.length == 65, "Invalid signature length");
        require(info.finalRands != bytes32(0), "Not reveal yet");
        // EIP-712 hash 생성
        bytes32 structHash = keccak256(abi.encode(
            SIGDATA_TYPEHASH,
            _roundId,
            _randSeed
        ));

        bytes32 digest = _hashTypedDataV4(structHash);

        // 서명 복원
        address recovered = ECDSA.recover(digest, info.signature);
        bool result = (recovered == signerAddr);
        return result;
    }

    /**
     * @notice 라운드별 난수정보 확인
     * @param _roundId 라운드 ID
     * @return finalRands 최종 난수
     */
    function finalRandsOf(uint256 _roundId) external view returns (bytes32 finalRands) {
        RoundRngInfo storage info = roundRngInfo[_roundId];
        return info.finalRands;
    }
}
