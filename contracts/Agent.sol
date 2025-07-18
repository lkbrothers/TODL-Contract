// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ItemParts.sol";

/**
 * @title Agent NFT Contract
 * @notice TODL Agent NFT를 관리하는 컨트랙트
 * @dev ItemParts NFT들을 조합하여 Agent NFT를 생성하고 관리
 * @author hlibbc
 */
contract AgentNFT is ERC721URIStorage, Ownable {

    /**
     * @notice BaseUri 변경 이벤트
     * @param newHash 변경된 BaseUri 해시값 (keccak256)
     */
    event BaseUriUpdated(bytes32 newHash);
    /**
     * @notice 민팅 이벤트
     * @dev 부위 오더링은 아래 지라링크 참조
     * https://lkbrothers.atlassian.net/browse/SGD-169
     * @param tokenId 민팅된 토큰 ID
     * @param owner 소유자 주소
     * @param headId Head 부위 itemParts NFT
     * @param bodyId Body 부위 itemParts NFT
     * @param legId Leg 부위 itemParts NFT
     * @param rhandId RightHand 부위 itemParts NFT
     * @param lhandId LeftHand 부위 itemParts NFT
     */
    event Minted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 headId,
        uint256 bodyId,
        uint256 legId,
        uint256 rhandId,
        uint256 lhandId
    );
    /**
     * @notice 소각 이벤트
     * @param tokenId 소각된 토큰 ID
     */
    event Burned(uint256 indexed tokenId);

    // def. CONSTANT
    string  public constant DEFAULT_BASE_URI = "http://test.sample.com/Agent/json/";
    
    // def. VARIABLE
    address public mainAddr; /// Main 컨트랙트 주소
    uint256 public totalSupply; /// 총 발행량

    bytes32 public baseUriHash; /// BaseUri 해시값
    string  public baseUri; /// BaseUri 문자열

    mapping(uint256 => uint256) public roundOf; /// 토큰ID별 라운드 정보
    mapping(uint256 => bytes32) public typeOf; /// 토큰ID별 타입 해시
    mapping(uint256 => uint256) public totalSupplyPerRound; /// 라운드별 총 발행량
    mapping(bytes32 => Types.NftCounts) public totalCountPerMintType; /// 타입별 전체 카운트
    mapping(uint256 => mapping(address => uint256)) public balanceOfPerRound; // 라운드별 사용자의 nft 보유개수
    mapping(uint256 => mapping(bytes32 => Types.NftCounts)) public mintTypeCountPerRound; /// 라운드별 타입별 카운트

    // def. MODIFIER
    /**
     * @notice Main 컨트랙트만 호출 가능하도록 제한
     */
    modifier onlyMain() {
        require(msg.sender == mainAddr, "Not Main contract");
        _;
    }

    /**
     * @notice Agent NFT 컨트랙트 생성자
     * @param _mainAddr Main 컨트랙트 주소
     */
    constructor(
        address _mainAddr
    ) ERC721("TODL Agent NFT", "AGENT") Ownable(msg.sender) {
        mainAddr = _mainAddr;
        baseUri = DEFAULT_BASE_URI;
        baseUriHash = keccak256(abi.encodePacked(DEFAULT_BASE_URI));
    }

    /**
     * @notice BaseUri 설정 함수
     * @param _baseUri 새로운 BaseUri
     */
    function setBaseURI(
        string memory _baseUri
    ) external onlyOwner {
        require(bytes(_baseUri).length > 0, "Invalid args");
        bytes32 newHash = keccak256(abi.encodePacked(_baseUri));
        require(baseUriHash != newHash, "Same Uri");
        baseUri = _baseUri;
        baseUriHash = newHash;
        emit BaseUriUpdated(newHash);
    }

    /**
     * @notice ItemParts NFT 컨트랙트 주소 조회
     * @return addr ItemParts NFT 컨트랙트 주소
     */
    function getItemPartsNftAddress() public view returns (address addr) {
        (bool success, bytes memory returnData) = mainAddr.staticcall(
            abi.encodeWithSelector(
                bytes4(keccak256("managedContracts(uint256)")),
                uint256(Types.ContractTags.ItemParts)
            )
        );
        require(success, "Agent: staticcall failed");
        addr = abi.decode(returnData, (address));
    }

    /**
     * @notice Agent NFT 민팅 (오직 Main 컨트랙트에서만 호출 가능)
     * @param _to 민팅받을 주소
     * @param _roundId 라운드 ID
     * @param itemPartsIds ItemParts NFT 토큰 ID 배열
     */
    function mint(
        address _to,
        uint256 _roundId,
        uint256[] memory itemPartsIds
    ) external onlyMain {
        uint256 tokenId = ++totalSupply;
        // 민트
        _mint(_to, tokenId);
        emit Minted(
            tokenId,
            _to,
            itemPartsIds[0],
            itemPartsIds[1],
            itemPartsIds[2],
            itemPartsIds[3],
            itemPartsIds[4]
        );
        // tokenURI 설정
        ItemPartsNFT itemParts = ItemPartsNFT(getItemPartsNftAddress());
        bytes memory agentName;
        uint loopCount = itemPartsIds.length;
        for(uint i = 0; i < loopCount; i++) {
            (,,,, string memory typeName) = itemParts.tokenInfo(itemPartsIds[i]);
            agentName = abi.encodePacked(agentName, typeName);
        }
        bytes32 agentHash = keccak256(agentName);
        string memory tokenUri = string(
            abi.encodePacked(
                baseUri, 
                agentHash, 
                ".json"
            )
        );
        _setTokenURI(tokenId, tokenUri);
        // Storage 갱신
        roundOf[tokenId] = _roundId;
        typeOf[tokenId] = agentHash;
        totalSupplyPerRound[_roundId]++;
        totalCountPerMintType[agentHash].mintCount++;
        balanceOfPerRound[_roundId][_to]++;
        mintTypeCountPerRound[_roundId][agentHash].mintCount++;
    }

    /**
     * @notice Agent NFT 소각 (오직 Main 컨트랙트에서만 호출 가능)
     * @param _holder 소각할 토큰의 소유자
     * @param _tokenId 소각할 토큰 ID
     */
    function burn(
        address _holder, 
        uint256 _tokenId
    ) external onlyMain {
        require(ownerOf(_tokenId) == _holder, "Not owner");
        // burn
        _burn(_tokenId);
        // Storage 갱신
        uint256 roundId = roundOf[_tokenId];
        bytes32 agentHash = typeOf[_tokenId];
        totalCountPerMintType[agentHash].burnCount++;
        balanceOfPerRound[roundId][_holder]--;
        mintTypeCountPerRound[roundId][agentHash].burnCount++;
        // 예외상황 체크
        Types.NftCounts memory afterCounts = totalCountPerMintType[agentHash];
        require(afterCounts.mintCount >= afterCounts.burnCount, "critical: missmatch counts(1)");
        afterCounts = mintTypeCountPerRound[roundId][agentHash];
        require(afterCounts.mintCount >= afterCounts.burnCount, "critical: missmatch counts(2)");
    }

    /**
     * @notice 토큰을 전송한다.
     * @dev 3rd party app으로 Agent NFT를 타인에게 전송 시, 관리되어야 할 storage 상태를 동기화하기 위해 overriding
     * @param _from ERC721과 동일
     * @param _to ERC721과 동일
     * @param _tokenId ERC721과 동일
     */
    function transferFrom(address _from, address _to, uint256 _tokenId) public override(ERC721, IERC721) {
        uint256 roundId = roundOf[_tokenId];
        balanceOfPerRound[roundId][_from]--;
        balanceOfPerRound[roundId][_to]++;
        super.transferFrom(_from, _to, _tokenId);
    }
    
    /**
     * @notice 전체 타입별 민팅 카운트 조회
     * @param _parts 5개 부위의 파츠명 배열
     * @return 해당 타입의 총 민팅 개수
     */
    function getMintCountByType(
        string[] memory _parts
    ) external view returns (uint256) {
        require(_parts.length == uint8(Types.Parts.Max), "Exactly 5 parts required");

        bytes memory combined;
        for (uint i = 0; i < _parts.length; i++) {
            combined = abi.encodePacked(combined, _parts[i]);
        }
        bytes32 typeHash = keccak256(combined);

        return totalCountPerMintType[typeHash].mintCount;
    }

    /**
     * @notice 라운드별 타입별 민팅 카운트 조회
     * @param _roundId 조회할 라운드 ID
     * @param _parts 5개 부위의 파츠명 배열
     * @return 해당 라운드의 해당 타입 민팅 개수
     */
    function getMintCountByTypePerRound(
        uint256 _roundId,
        string[] memory _parts
    ) external view returns (uint256) {
        require(_parts.length == uint8(Types.Parts.Max), "Exactly 5 parts required");

        bytes memory combined;
        for (uint i = 0; i < _parts.length; i++) {
            combined = abi.encodePacked(combined, _parts[i]);
        }
        bytes32 typeHash = keccak256(combined);

        return mintTypeCountPerRound[_roundId][typeHash].mintCount;
    }
}
