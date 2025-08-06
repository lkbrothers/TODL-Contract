// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./libs/Types.sol";

/**
 * @title ItemParts NFT Contract
 * @notice TODL ItemParts NFT를 관리하는 컨트랙트
 * @dev Agent NFT를 구성하는 부위별 파츠 NFT를 생성하고 관리
 * @author hlibbc
 */
contract ItemPartsNFT is ERC721URIStorage, Ownable {
    using Types for Types.Parts;
    using Types for Types.Origins;
    using Types for Types.SetNums;

    // def. EVENT (잠수함패치 막기 용도)
    /**
     * @notice 메인컨트랙트 변경 이벤트
     * @param mainAddr 변경된 메인컨트랙트 주소
     */
    event MainContractUpdated(address indexed mainAddr);
    /**
     * @notice BaseUri 변경 이벤트
     * @param newHash 변경된 BaseUri 해시값 (keccak256)
     */
    event BaseUriUpdated(bytes32 newHash);
    /**
     * @notice mintAtTime(1회 민트갯수) 변경 이벤트
     * @param mintNum 변경된 mintAtTime
     */
    event MintAtTimeUpdated(uint256 mintNum);
    /**
     * @notice maxMintsPerDay(1일 최대민트갯수) 변경 이벤트
     * @param maxMintPerDay 변경된 maxMintsPerDay
     */
    event MaxMintPerDayUpdated(uint256 maxMintPerDay);
    /**
     * @notice parts 변경 이벤트
     * @dev 부위를 다시 정의한다.
     * @param arrayLength 변경된 배열의 총 길이
     */
    event PartsUpdated(uint256 arrayLength);
    /**
     * @notice origins 변경 이벤트
     * @dev origins를 다시 정의한다.
     * @param arrayLength 변경된 배열의 총 길이
     */
    event OriginsUpdated(uint256 arrayLength);
    /**
     * @notice setNums 변경 이벤트
     * @dev setNums를 다시 정의한다.
     * @param arrayLength 변경된 배열의 총 길이
     */
    event SetnumsUpdated(uint256 arrayLength);
    /**
     * @notice 민팅 이벤트
     * @dev 민팅횟수당 1회씩 발생
     * @param tokenId 민팅된 토큰ID
     * @param owner 소유자 주소
     * @param partsIndex 민팅된 토큰의 parts 인덱스
     * @param originsIndex 민팅된 토큰의 origins 인덱스
     * @param setNumsIndex 민팅된 토큰의 setNums 인덱스
     */
    event Minted(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 partsIndex,
        uint256 originsIndex,
        uint256 setNumsIndex
    );
    /**
     * @notice 소각 이벤트
     * @param tokenId 소각된 토큰ID
     */
    event Burned(uint256 indexed tokenId);

    // def. ERROR
    error MintAtTimeOutOfRange(uint256 proposal); // mintAtTime 입력값 범위초과
    error MaxMintsPerDayOutOfRange(uint256 proposal); // maxMintsPerDay 입력값 범위초과
    error NotMainContract(address msgSender); // onlyMain
    error DailyLimitsExceeded(uint256 timestamps); // 타임스탬프 로깅: 얼마나 빨리 고갈되는지 체크용
    error InvalidTypeIndex(uint256 partsIdx, uint256 conceptsIdx, uint256 setNumsIdx); // 잘못된 타입인덱스 로깅
    
    // def. CONSTANT
    uint256 public constant MINT_AT_TIME = 5; // 한번에 5개
    uint256 public constant MAX_FREE_MINTS_PER_DAY = 50000000; // 하루에 50개
    string  public constant DEFAULT_BASE_URI = "https://dev.todl.fun/api/file-download/json/";
    
    // def. VARIABLE
    address public mainAddr; /// Main 컨트랙트 주소
    uint256 public totalSupply; /// 총 발행량
    uint256 public mintAtTime; /// 1회 민팅 개수
    uint256 public maxMintsPerDay; /// 1일 최대 민팅 개수
    bytes32 public baseUriHash; /// BaseUri 해시값
    string  public baseUri; /// BaseUri 문자열

    string[] public parts; /// 부위별 문자열 배열
    string[] public origins; /// 기원별 문자열 배열
    string[] public setNums; /// 세트번호별 문자열 배열

    mapping(uint256 => Types.MintTypeInfo) public tokenInfo; /// tokenID 별 MintTypeInfo
    mapping(bytes32 => Types.NftCounts) public countPerMintType; /// MintType별 민팅된 카운트
    mapping(address => uint256) public lastMintedDay; /// 주소별 마지막 민팅 날짜
    mapping(address => uint256) public mintedTodayCount; /// 주소별 오늘 민팅 개수

    // def. MODIFIER
    /**
     * @notice Main 컨트랙트만 호출 가능하도록 제한
     */
    modifier onlyMain() {
        if(msg.sender != mainAddr) {
            revert NotMainContract(msg.sender);
        }
        _;
    }

    /**
     * @notice ItemParts NFT 컨트랙트 생성자
     * @param _mainAddr Main 컨트랙트 주소
     */
    constructor(
        address _mainAddr
    ) ERC721("TODL ItemParts NFT", "PART") Ownable(msg.sender) {
        require(_mainAddr > address(0), "Invalid address");
        for(uint8 i = 0; i < uint8(Types.Parts.Max); i++) {
            parts.push(_PartstoString(i));
        }
        for(uint8 i = 0; i < uint8(Types.Origins.Max); i++) {
            origins.push(_OriginstoString(i));
        }
        for(uint8 i = 0; i < uint8(Types.SetNums.Max); i++) {
            setNums.push(_SetNumstoString(i));
        }
        mainAddr = _mainAddr;
        baseUri = DEFAULT_BASE_URI;
        baseUriHash = keccak256(abi.encodePacked(DEFAULT_BASE_URI));
        mintAtTime = MINT_AT_TIME;
        maxMintsPerDay = MAX_FREE_MINTS_PER_DAY;
    }

    /**
     * @notice Main 컨트랙트 주소 설정
     * @dev onlyOwner
     * @param _mainAddr 새로운 Main 컨트랙트 주소
     */
    function setMainAddr(address _mainAddr) external onlyOwner {
        require(_mainAddr > address(0), "Invalid address");
        mainAddr = _mainAddr;
        emit MainContractUpdated(_mainAddr);
    }

    /**
     * @notice mintAtTime(1회 민팅갯수)을 설정한다.
     * @dev onlyOwner
     * mintAtTime은 10보다 작아야 한다. (난수생성 알고리즘과 연관)
     * @param _mintAtTime 새로운 "1회 민팅갯수"
     */
    function setValueMintAtTime(uint256 _mintAtTime) external onlyOwner {
        if(!(_mintAtTime > 0 && _mintAtTime < 10)) {
            revert MintAtTimeOutOfRange(_mintAtTime);
        }
        mintAtTime = _mintAtTime;
        emit MintAtTimeUpdated(_mintAtTime);
    }

    /**
     * @notice maxMintsPerDay(1일 최대민팅갯수)을 설정한다.
     * @dev onlyOwner
     * @param _maxMintPerDay 새로운 "1일 최대민팅갯수"
     */
    function setValueMaxMintsPerDay(uint256 _maxMintPerDay) external onlyOwner {
        if(_maxMintPerDay < mintAtTime) {
            revert MaxMintsPerDayOutOfRange(_maxMintPerDay);
        }
        maxMintsPerDay = _maxMintPerDay;
        emit MaxMintPerDayUpdated(_maxMintPerDay);
    }

    /**
     * @notice BaseUri 설정 함수
     * @dev onlyOwner
     * @param _baseUri 새로운 BaseUri
     */
    function setBaseURI(string memory _baseUri) external onlyOwner {
        require(bytes(_baseUri).length > 0, "Invalid args");
        bytes32 newHash = keccak256(abi.encodePacked(_baseUri));
        require(baseUriHash != newHash, "Same Uri");
        baseUri = _baseUri;
        baseUriHash = newHash;
        emit BaseUriUpdated(newHash);
    }

    /**
     * @notice parts 배열 설정 함수
     * @dev onlyOwner
     * @param _parts 새로운 parts 배열
     */
    function setParts(string[] memory _parts) external onlyOwner {
        require(_parts.length > 0, "Invalid args");
        delete parts;
        for(uint i = 0; i < _parts.length; i++) {
            parts.push(_parts[i]);
        }
        emit PartsUpdated(parts.length);
    }

    /**
     * @notice origins 배열 설정 함수
     * @param _origins 새로운 origins 배열
     */
    function setOrigins(string[] memory _origins) external onlyOwner {
        require(_origins.length > 0, "Invalid args");
        delete origins;
        for(uint i = 0; i < _origins.length; i++) {
            origins.push(_origins[i]);
        }
        emit OriginsUpdated(origins.length);
    }

    /**
     * @notice setNums 배열 설정 함수
     * @dev onlyOwner
     * @param _setNums 새로운 setNums 배열
     */
    function setSetNums(string[] memory _setNums) external onlyOwner {
        require(_setNums.length > 0, "Invalid args");
        delete setNums;
        for(uint i = 0; i < _setNums.length; i++) {
            setNums.push(_setNums[i]);
        }
        emit SetnumsUpdated(setNums.length);
    }

    /**
     * @notice ItemParts NFT 민팅 함수
     * @dev 한 번에 mintAtTime 개수만큼 민팅
     */
    function mint() external {
        uint256 today = block.timestamp / 1 days;
        if (lastMintedDay[msg.sender] < today) {
            mintedTodayCount[msg.sender] = 0;
            lastMintedDay[msg.sender] = today;
        }
        if(mintedTodayCount[msg.sender] > maxMintsPerDay) {
            revert DailyLimitsExceeded(block.timestamp);
        }
        bytes32 hash = keccak256(abi.encode(msg.sender, block.timestamp)); // Entropies: msg.sender, block.timestamp
        for(uint i = 0; i < mintAtTime; i++) {
            uint256 partIndex = uint8(hash[0+i]) % parts.length;
            uint256 originIndex = uint8(hash[10+i]) % origins.length;
            uint256 setNumsIndex = uint8(hash[20+i]) % setNums.length;
            bytes32 typeHash = getTypeHash(partIndex, originIndex, setNumsIndex);

            uint256 tokenId = ++totalSupply;
            // 민트
            _mint(msg.sender, tokenId);
            emit Minted(tokenId, msg.sender, partIndex, originIndex, setNumsIndex);
            // tokenURI 설정
            string memory tokenUri = string(
                abi.encodePacked(
                    baseUri, 
                    tokenInfo[tokenId].typeName, 
                    ".json"
                )
            );
            _setTokenURI(tokenId, tokenUri);
            // Storage 갱신
            mintedTodayCount[msg.sender]++;
            tokenInfo[tokenId].partsIndex = partIndex;
            tokenInfo[tokenId].originsIndex = originIndex;
            tokenInfo[tokenId].setNumsIndex = setNumsIndex;
            tokenInfo[tokenId].typeHash = typeHash;
            countPerMintType[typeHash].mintCount++;
            _setTypeName(tokenId, partIndex, originIndex, setNumsIndex);
        }
    }

    /**
     * @notice ItemParts NFT 소각 함수 (오직 Main 컨트랙트에서만 호출 가능)
     * @dev onlyMain
     * @param _holder 소각할 토큰의 소유자
     * @param _tokenId 소각할 토큰 ID
     */
    function burn(
        address _holder, 
        uint256 _tokenId
    ) external onlyMain {
        require(ownerOf(_tokenId) == _holder, "Not the owner");
        require(tokenInfo[_tokenId].typeHash != bytes32(0), "Invalid Typehash");
        
        // burn 
        _burn(_tokenId);
        emit Burned(_tokenId);
        // Storage 갱신
        countPerMintType[tokenInfo[_tokenId].typeHash].burnCount++;
        // 예외상황 체크
        bytes32 typeHash = tokenInfo[_tokenId].typeHash;
        Types.NftCounts memory afterCounts = countPerMintType[typeHash];
        require(afterCounts.mintCount >= afterCounts.burnCount, "critical: missmatch counts");
    }

    function makeTypeName(
        uint8 _partsIndex, 
        uint8 _originsIndex, 
        uint8 _setNumsIndex
    ) public pure returns(bytes memory result) {
        result = abi.encodePacked(
            _PartstoString(_partsIndex), "-",
            _OriginstoString(_originsIndex), "-",
            _SetNumstoString(_setNumsIndex)
        );
    }

    /**
     * @notice 타입 해시값 조회
     * @param _partIndex 부위 인덱스
     * @param _originIndex 기원 인덱스
     * @param _setNumsIndex 세트번호 인덱스
     * @return 타입 해시값
     */
    function getTypeHash(
        uint256 _partIndex, 
        uint256 _originIndex, 
        uint256 _setNumsIndex
    ) public view returns (bytes32) {
        uint256 partsLen = parts.length;
        uint256 conceptLen = origins.length;
        uint256 setNumsLen = setNums.length;
        if(!(_partIndex < partsLen && _originIndex < conceptLen && _setNumsIndex < setNumsLen)) {
            revert InvalidTypeIndex(_partIndex, _originIndex, _setNumsIndex);
        }
        return keccak256(
            abi.encodePacked(
                parts[_partIndex], "-",
                origins[_originIndex], "-",
                setNums[_setNumsIndex]
            )
        );
    }

    /**
     * @notice 특정 타입의 현재 보유 개수 조회
     * @param _partIndex 부위 인덱스
     * @param _originIndex 기원 인덱스
     * @param _setNumsIndex 세트번호 인덱스
     * @return 해당 타입의 현재 보유 개수 (민팅 개수 - 소각 개수)
     */
    function currentCountOf(
        uint256 _partIndex, 
        uint256 _originIndex, 
        uint256 _setNumsIndex
    ) public view returns (uint256) {
        bytes32 typeHah = getTypeHash(_partIndex, _originIndex, _setNumsIndex);
        return countPerMintType[typeHah].mintCount - countPerMintType[typeHah].burnCount;
    }

    /**
     * @notice 사용자가 오늘 몇 번 더 민팅할 수 있는지 조회
     * @param _user 조회할 사용자 주소
     * @return 남은 민팅 횟수
     */
    function getRemainingMintsToday(address _user) public view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        uint256 userMintedToday = 0;
        
        // 오늘 민팅한 횟수 확인
        if (lastMintedDay[_user] == today) {
            userMintedToday = mintedTodayCount[_user];
        }
        
        // 남은 횟수 계산 (최대값 - 오늘 민팅한 횟수)
        if (userMintedToday >= maxMintsPerDay) {
            return 0;
        } else {
            return maxMintsPerDay - userMintedToday;
        }
    }

    /**
     * @notice 토큰의 타입명 설정 (내부 함수)
     * @param _tokenId 토큰 ID
     * @param _partIndex 부위 인덱스
     * @param _originIndex 기원 인덱스
     * @param _setNumsIndex 세트번호 인덱스
     */
    function _setTypeName(
        uint256 _tokenId,
        uint256 _partIndex, 
        uint256 _originIndex, 
        uint256 _setNumsIndex
    ) internal {
        bytes memory rawBytes = abi.encodePacked(
            parts[_partIndex], "-",
            origins[_originIndex], "-",
            setNums[_setNumsIndex]
        );
        string memory typeName = string(rawBytes); 
        tokenInfo[_tokenId].typeName = typeName;
    }

    function _PartstoString(uint8 index) internal pure returns(string memory) {
        Types.Parts _part = Types.Parts(index);
        if(_part == Types.Parts.Head)  return "Head";
        if(_part == Types.Parts.Body)  return "Body";
        if(_part == Types.Parts.Legs)  return "Legs";
        if(_part == Types.Parts.RHand) return "RHand";
        if(_part == Types.Parts.LHand) return "LHand";
        revert("Invalid Parts enum");
    }

    function _OriginstoString(uint8 index) internal pure returns(string memory) {
        Types.Origins _origin = Types.Origins(index);
        if(_origin == Types.Origins.Todl)      return "TODL";
        if(_origin == Types.Origins.Earthling) return "Earthling";
        if(_origin == Types.Origins.BadGen)    return "BadGen";
        revert("Invalid Origins enum");
    }

    function _SetNumstoString(uint8 index) internal pure returns(string memory) {
        Types.SetNums _setNum = Types.SetNums(index);
        if(_setNum == Types.SetNums.One)   return "1";
        if(_setNum == Types.SetNums.Two)   return "2";
        if(_setNum == Types.SetNums.Three) return "3";
        if(_setNum == Types.SetNums.Four)  return "4";
        revert("Invalid SetNums enum");
    }
}
