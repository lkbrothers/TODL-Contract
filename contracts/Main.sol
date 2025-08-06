// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Agent.sol";
import "./ItemParts.sol";
import "./RewardPool.sol";
import "./Rng.sol";
import "./libs/Types.sol";

/**
 * @title Main Contract
 * @notice TODL 프로젝트의 메인 컨트랙트
 * @dev 주요 기능은 아래와 같다.
 * - 라운드의 라이프사이클 (시작 - 종료 - 정산)을 관리
 * - 라운드별 랜덤값 및 최종 당첨값 관리
 * - Agent Minting 및 민틴재료(ItemParts) 소각
 * - Pool에 민팅비 입금
 * @author hlibbc
 */
contract Main is Ownable {
    using Types for Types.Parts;
    using Types for Types.Origins;
    using Types for Types.SetNums;

    // def. STRUCT
    /**
     * @notice 라운드별 상태 관리정보
     * @dev 라운드는 1일 주기 (UTC00:00 ~ UTC23:59)
     * 동시에 진행되는 라운드는 없어야 한다.
     */
    struct RoundStatusManageInfo {
        Types.RoundStatus status;   /// 라운드 상태
        uint64 startedAt;           /// 라운드 시작 시각 (startRound 호출시각)
        uint64 closeTicketAt;       /// 라운드 세일종료 시각 (closeTicketRound 호출시각)
        uint64 settledAt;           /// 라운드 정산 시각 (settleRound 호출시각)
        uint64 refundedAt;          /// 라운드 환불 시각 (refund 호출시각)
        uint64 endedAt;             /// 라운드 종료 시각
    }
    /**
     * @notice 라운드별 위너 관리정보
     * @dev winningHash, winnerCount 값 관리
     */
    struct RoundWinnerManageInfo {
        bytes32 winningHash;    /// 최종 당첨 nft type hash
        uint256 winnerCount;    /// 최종 당첨자 수
    }
    /**
     * @notice 라운드별 정산 관리정보
     * @dev refundedAmount > 0이면, 하기 필드들은 다 0이어야 한다.
     *     - totalPrizePayout
     *     - corporateAmount
     *     - donateAmount
     *     - operationAmount
     *     - stakedAmount
     * status가 End가 아닌데 carriedOutAmount가 >0 일 수는 없다.
     */
    struct RoundSettleManageInfo {
        uint256 depositedAmount;    /// 라운드별 총 모금액

        uint256 totalPrizePayout;   /// 당첨자에게 지불되어야 할 총 금액 (70%)
        uint256 prizePerWinner;     /// 당첨자 한명에게 지불되어야 할 금액
        uint256 claimedAmount;      /// 당첨금 수령해간 금액

        uint256 donateAmount;       /// 기부금으로 나간 금액 (10%)
        uint256 corporateAmount;    /// 투자금으로 나간 금액 (10%)
        uint256 operationAmount;    /// 운영비 (5%)
        uint256 stakedAmount;       /// 스테이킹한 금액 (5%)

        uint256 refundedAmount;     /// 환불해간 금액

        uint256 carriedOutAmount;   /// 이월된 금액
    }

    // def. EVENT
    /**
     * @notice 라운드 시작 이벤트
     * @param roundId 시작된 라운드 ID
     */
    event RoundStarted(uint256 indexed roundId);
    /**
     * @notice 라운드 "게임참여 종료" 이벤트
     * @dev 상기 이벤트 발생 이후부터는 해당 라운드에 대해 게임참여가 불가능하다.
     * @param roundId "게임참여 종료"된 라운드 ID
     * @param msgSender 라운드를 "게임참여 종료"한 주소
     */
    event RoundSaleEnd(
        uint256 indexed roundId, 
        address indexed msgSender
    );
    /**
     * @notice 라운드 정산 이벤트
     * @param roundId 정산된 라운드 ID
     * @param winningHash 당첨 Agent hash
     */
    event RoundSettled(
        uint256 indexed roundId,
        bytes32 winningHash
    );

    /**
     * @notice 라운드 종료 이벤트
     * @param roundId 종료된 라운드 ID
     */
    event RoundEnd(uint256 indexed roundId);

    // def. ERROR
    error CannotEndRoundYet(uint256 roundId, uint256 startAt, uint256 currentTime);
    error CloseTicketRoundNotReady(uint64 currentTime, uint64 startAt, uint64 availAt);
    error EndRoundNotAllowed(uint256 roundId, uint256 roundStatus);
    error InsufficientCoin(address buyer, uint256 amount);
    error InvalidParts(uint256 tokenId, uint256 partsId, uint256 requiredParts);
    error LastRoundNotEnded(uint256 roundId, uint8 status);
    error NotAdmin(address caller);
    error NotItemPartsOwner(address holder, uint256 nftId);
    error FatalAmountDiscrepancy(
        uint256 roundId,
        uint256 depositedAmount,
        uint256 claimedAmount,
        uint256 donateAmount,
        uint256 corporateAmount,
        uint256 operationAmount,
        uint256 stakedAmount
    );

    // def. VARIABLE
    uint256 public roundId; // 현재 라운드 ID (1부터 시작)
    address public donateAddr; // Donation 주소
    address public corporateAddr; // 영리법인 주소
    address public operationAddr; // 운영비 주소
    address[] public managedContracts; /// Inter-action 컨트랙트 리스트
    mapping(address => bool) public admins; // 라운드 상태변경 권한 소유자
    mapping(uint256 => RoundStatusManageInfo) public roundStatusManageInfo; /// 라운드별 정보관리 매핑변수
    mapping(uint256 => RoundWinnerManageInfo) public roundWinnerManageInfo; /// 라운드별 정보관리 매핑변수
    mapping(uint256 => RoundSettleManageInfo) public roundSettleManageInfo; /// 라운드별 정보관리 매핑변수

    // def. MODIFIER
    /**
     * @notice admin만 호출 가능하도록 제한
     */
    modifier onlyAdmin() {
        if(admins[msg.sender] != true) {
            revert NotAdmin(msg.sender);
        }
        _;
    }

    /**
     * @notice Main 컨트랙트 생성자
     * @param _admins admins 주소 배열
     * @param _donate donate 주소
     * @param _corporate corporate 주소
     * @param _operations operations 주소
     */
    constructor(
        address[] memory _admins, 
        address _donate, 
        address _corporate, 
        address _operations
    ) Ownable(msg.sender) {
        require(_donate != address(0), "main: zero address (_donate)");
        require(_corporate != address(0), "main: zero address (_corporate");
        require(_operations != address(0), "main: zero address (_operations");
        require(_admins.length > 0, "main: invalid admins");
        admins[msg.sender] = true;
        donateAddr = _donate;
        corporateAddr = _corporate;
        operationAddr = _operations;
        for(uint i = 0; i < _admins.length; i++) {
            require(_admins[i] != address(0), "main: zero address (_admins)");
            admins[_admins[i]] = true;
        }
    }

    /**
     * @notice 관리되어야 할 컨트랙트 주소들을 등록한다.
     * @dev onlyOwner
     * 관리되어야 할 주소: ItemParts, Agent, Pool, Rng, Stt
     * @param _contractAddrs 컨트랙트 주소 배열
     */
    function setContracts(
        address[] memory _contractAddrs
    ) external onlyOwner {
        delete managedContracts;
        managedContracts.push(address(this));
        for(uint i = 0; i < _contractAddrs.length; i++) {
            managedContracts.push(_contractAddrs[i]);
        }
        require(managedContracts.length == uint8(Types.ContractTags.Max), "Incorrect Contract Nums");
    }

    /**
     * @notice admin 주소를 설정한다.
     * @dev onlyOwner
     * @param _adminAddress 설정할 admin 주소
     * @param _flag 설정값 (true: set / false: reset)
     */
    function setAdminAddress(address _adminAddress, bool _flag) external onlyOwner {
        require(_adminAddress != address(0), "admin: zero address");
        require(admins[_adminAddress] != _flag, "admin: same setting");
        admins[_adminAddress] = _flag;
    }

    /**
     * @notice 기부금 주소를 설정한다.
     * @dev onlyOwner
     * @param _donateAddress 설정할 기부금 주소
     */
    function setDonateAddress(address _donateAddress) external onlyOwner {
        require(_donateAddress != address(0), "donate: zero address");
        require(donateAddr != _donateAddress, "donate: same address");
        donateAddr = _donateAddress;
    }

    /**
     * @notice 영리법인 주소를 설정한다.
     * @dev onlyOwner
     * @param _corporateAddress 설정할 영리법인 주소
     */
    function setCorporateAddress(address _corporateAddress) external onlyOwner {
        require(_corporateAddress != address(0), "corporate: zero address");
        require(corporateAddr != _corporateAddress, "corporate: same address");
        corporateAddr = _corporateAddress;
    }

    /**
     * @notice 운영비 주소를 설정한다.
     * @dev onlyOwner
     * @param _operationAddress 설정할 운영비 주소
     */
    function setOperationAddress(address _operationAddress) external onlyOwner {
        require(_operationAddress != address(0), "operation: zero address");
        require(operationAddr != _operationAddress, "operation: same address");
        operationAddr = _operationAddress;
    }

    /**
     * @notice 라운드를 시작한다.
     * @dev onlyAdmin
     * @param _signature 데이터 서명
     */
    function startRound(bytes calldata _signature) external onlyAdmin {
        if(roundId > 0) {
            if(uint8(roundStatusManageInfo[roundId].status) < uint8(Types.RoundStatus.Claiming)) {
                revert LastRoundNotEnded(roundId, uint8(roundStatusManageInfo[roundId].status));
            }
        }
        ++roundId; // new round!
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        (bool success, ) = managedContracts[uint8(Types.ContractTags.Rng)].call(
            abi.encodeWithSelector(
                bytes4(keccak256("commit(uint256,bytes)")),
                roundId,
                _signature
            )
        );
        require(success, "RNG: commit failed");

        roundStatusInfo.status = Types.RoundStatus.Proceeding;
        roundStatusInfo.startedAt = uint64(block.timestamp);
        emit RoundStarted(roundId);
    }

    /**
     * @notice 라운드 세일종료를 수행한다.
     * @dev admin이 아닌 다른 모든 Agent NFT 소유자들이 호출가능
     * 현재 진행중(Processing)인 라운드가 있어야 함
     * 라운드종료 가능시각(UTC23:00 ~)을 만족해야 함
     */
    function closeTicketRound() external {
        require(admins[msg.sender] != true, "Not permitted");
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        require(roundStatusInfo.status == Types.RoundStatus.Proceeding, "Round is not proceeding");
        // uint64 startedTimeEstimated = roundStatusInfo.startedAt - (roundStatusInfo.startedAt % Types.ROUND_PERIOD);
        // if(uint64(block.timestamp) - startedTimeEstimated < uint64(Types.ROUND_CLOSETICKET_AVAIL_TIME)) {
        //     revert CloseTicketRoundNotReady(
        //         uint64(block.timestamp), 
        //         startedTimeEstimated, 
        //         (startedTimeEstimated + uint64(Types.ROUND_CLOSETICKET_AVAIL_TIME))
        //     );
        // }

        (bool success, ) = managedContracts[uint8(Types.ContractTags.Rng)].call(
            abi.encodeWithSelector(
                bytes4(keccak256("sealEntropy(uint256,address)")),
                roundId,
                msg.sender
            )
        );
        require(success, "RNG: sealEntropy failed");

        roundStatusInfo.status = Types.RoundStatus.Drawing;
        roundStatusInfo.closeTicketAt = uint64(block.timestamp);
        emit RoundSaleEnd(roundId, msg.sender);
    }

    /**
     * @notice 라운드를 정산한다.
     * @dev onlyAdmin
     * 하기의 동작이 수행된다.
     * - 최종 당첨 NFT가 결정된다.
     * - 최종 당첨자수가 결정된다.
     * - 총 모인금액을 기준으로 하기의 필드들이 결정되며, Pool에서 출금된다.
     *     - corporateAmount
     *     - donateAmount
     *     - operationAmount
     *     - stakedAmount
     * @param _randSeed 시드 값 (초기에 생성된 값)
     */
    function settleRound(
        uint256 _randSeed
    ) external onlyAdmin {
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        require(roundStatusInfo.status == Types.RoundStatus.Drawing, "Round is not drawing");
        (bool success, ) = managedContracts[uint8(Types.ContractTags.Rng)].call(
            abi.encodeWithSelector(
                bytes4(keccak256("reveal(uint256,uint256)")),
                roundId,
                _randSeed
            )
        );
        require(success, "RNG: reveal failed");
        
        {
            Rng rng = Rng(managedContracts[uint8(Types.ContractTags.Rng)]);
            bytes32 finalRands = rng.finalRandsOf(roundId);
            bytes memory agentName;
            ItemPartsNFT itemParts = ItemPartsNFT(managedContracts[uint8(Types.ContractTags.ItemParts)]);
            for(uint8 i = 0; i < uint8(Types.Parts.Max); i++) {
                uint8 partIndex = i; // 부위별 (0 ~ 4)
                uint8 originIndex = uint8(finalRands[10+i]) % uint8(Types.Origins.Max);
                uint8 setNumsIndex = uint8(finalRands[20+i]) % uint8(Types.SetNums.Max);
                agentName = abi.encodePacked(agentName, itemParts.makeTypeName(partIndex, originIndex, setNumsIndex));
            }
            bytes32 winningHash = keccak256(agentName); // 최종당첨 nft hash
            RoundWinnerManageInfo storage roundWinnerInfo = roundWinnerManageInfo[roundId];
            roundWinnerInfo.winningHash = winningHash;
            AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
            (uint mintCount,) = agent.mintTypeCountPerRound(roundId, roundWinnerInfo.winningHash); // 최종 당첨자 수
            roundWinnerInfo.winnerCount = mintCount;
            emit RoundSettled(roundId, winningHash);
        }
        _settlePrize(roundId); // 분배할 금액 정산

        roundStatusInfo.status = Types.RoundStatus.Claiming;
        roundStatusInfo.settledAt = uint64(block.timestamp);
    }

    /**
     * @notice 라운드를 종료한다.
     * @dev onlyAdmin
     * 라운드가 시작된 후 ROUND_PAYOUT_LIMIT_TIME 시간이 지나면 라운드를 종료할 수 있다.
     * 라운드 종료 시 남은 금액을 이월 처리한다.
     * @param _roundId 종료할 라운드 ID
     */
    function endRound(uint256 _roundId) external onlyAdmin {
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        Types.RoundStatus roundStatus = roundStatusInfo.status;
        if(roundStatus == Types.RoundStatus.NotStarted || roundStatus == Types.RoundStatus.Ended) {
            revert EndRoundNotAllowed(_roundId, uint8(roundStatus));
        }
        uint256 startedAt;
        if(roundStatus == Types.RoundStatus.Proceeding) {
            startedAt = roundStatusInfo.startedAt;
        } else if(roundStatus == Types.RoundStatus.Drawing) {
            startedAt = roundStatusInfo.closeTicketAt;
        } else if(roundStatus == Types.RoundStatus.Claiming) {
            startedAt = roundStatusInfo.settledAt;
        } else { // roundStatus == Types.RoundStatus.Refunding
            startedAt = roundStatusInfo.refundedAt;
        }
        if(uint64(block.timestamp) - startedAt < Types.ROUND_PAYOUT_LIMIT_TIME) {
            revert CannotEndRoundYet(_roundId, startedAt, block.timestamp);
        }
        _carryingOutProc(_roundId);
        roundStatusInfo.endedAt = uint64(block.timestamp);
        roundStatusInfo.status = Types.RoundStatus.Ended;
        emit RoundEnd(_roundId);
    }

    /**
     * @notice 부위별 Parts를 소각하여 Agent를 민팅한다. 민팅비로 1 STT를 받는다.
     * @dev 아래 절차를 수행한다.
     * - 하기 사항 체크
     *     - 현재 buy 가능한 상태인지 (Processing)
     *     - msg.sender가 민팅비를 보유하고 있는지
     *     - msg.sender가 부위별 파츠를 보유하고 있는지
     * - Pool에 민팅비 위임대납
     * - Agent NFT minting
     * - ItemParts NFT burning
     * @param _itemPartsIds 조합할 ItemParts 부위별 ID
     * @param _permitSig 1 STT permit signature
     */
    function buyAgent(
        uint256[] memory _itemPartsIds,
        uint256 _deadline,
        bytes calldata _permitSig
    ) external {
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        require(roundStatusInfo.status == Types.RoundStatus.Proceeding, "Round is not proceeding");
        uint256 callerBalance = getCoinBalance(msg.sender);
        if(callerBalance < Types.AGENT_MINTING_FEE) {
            revert InsufficientCoin(msg.sender, callerBalance);
        }
        _checkValidItemParts(msg.sender, _itemPartsIds);
        
        RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
        rewardPool.deposit(msg.sender, Types.AGENT_MINTING_FEE, _deadline, _permitSig);

        RoundSettleManageInfo storage roundSettleInfo = roundSettleManageInfo[roundId];

        roundSettleInfo.depositedAmount += Types.AGENT_MINTING_FEE; // 입금액 누적
        
        AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
        agent.mint(msg.sender, roundId, _itemPartsIds);
        
        ItemPartsNFT itemParts = ItemPartsNFT(managedContracts[uint8(Types.ContractTags.ItemParts)]);
        for(uint i = 0; i < _itemPartsIds.length; i++) {
            itemParts.burn(msg.sender, _itemPartsIds[i]);
        }
    }

    /**
     * @notice 당첨 Agent NFT를 소각하고 당첨금을 수령한다.
     * @dev 당첨 Agent NFT 소유자만 호출 가능
     * 라운드 상태가 Claiming이어야 하며, Agent가 해당 라운드의 당첨 타입이어야 한다.
     * 당첨금 수령 후 라운드 종료 조건을 만족하면 라운드를 종료한다.
     * @param _roundId 라운드 ID
     * @param _agentId 소각할 Agent NFT ID
     */
    function claim(
        uint256 _roundId, 
        uint256 _agentId
    ) external {
        AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
        {
            require(agent.ownerOf(_agentId) == msg.sender, "claim: Not owner");
            RoundWinnerManageInfo storage roundWinnerInfo = roundWinnerManageInfo[_roundId];
            require(agent.typeOf(_agentId) == roundWinnerInfo.winningHash, "claim: Not winner");
            require(agent.roundOf(_agentId) == _roundId, "Mismatch (Agent & round)");
        }
        {
            RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[_roundId];
            require(roundStatusInfo.status == Types.RoundStatus.Claiming, "Round is not claiming");
            if(uint64(block.timestamp) - roundStatusInfo.settledAt > Types.ROUND_PAYOUT_LIMIT_TIME) {
                _carryingOutProc(_roundId);
                roundStatusInfo.endedAt = uint64(block.timestamp);
                roundStatusInfo.status = Types.RoundStatus.Ended;
                emit RoundEnd(_roundId);
            }
        }
        {
            agent.burn(msg.sender, _agentId);
            RoundSettleManageInfo storage roundSettleInfo = roundSettleManageInfo[_roundId];
            RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
            uint256 amount = roundSettleInfo.prizePerWinner;
            rewardPool.withdraw(msg.sender, amount);
            roundSettleInfo.claimedAmount += amount;
        }
    }

    /**
     * @notice Agent NFT를 소각하고 민팅비를 환불받는다.
     * @dev Agent NFT 소유자만 호출 가능
     * 라운드가 ROUND_PERIOD 시간을 초과하면 환불 상태로 변경된다.
     * 환불 후 라운드 종료 조건을 만족하면 라운드를 종료한다.
     * @param _roundId 라운드 ID
     * @param _agentId 소각할 Agent NFT ID
     */
    function refund(
        uint256 _roundId, 
        uint256 _agentId
    ) external {
        AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
        require(agent.roundOf(_agentId) == _roundId, "Mismatch (Agent & round)");
        {
            RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[_roundId];
            if(roundStatusInfo.status == Types.RoundStatus.Proceeding || roundStatusInfo.status == Types.RoundStatus.Drawing) {
                if(uint64(block.timestamp) - roundStatusInfo.startedAt > Types.ROUND_REFUND_AVAIL_TIME) {
                    roundStatusInfo.refundedAt = uint64(block.timestamp);
                    roundStatusInfo.status = Types.RoundStatus.Refunding;
                }
            }
            require(roundStatusInfo.status == Types.RoundStatus.Refunding, "Round is not Refunding");
            if(uint64(block.timestamp) - roundStatusInfo.refundedAt > Types.ROUND_PAYOUT_LIMIT_TIME) {
                _carryingOutProc(_roundId);
                roundStatusInfo.endedAt = uint64(block.timestamp);
                roundStatusInfo.status = Types.RoundStatus.Ended;
                emit RoundEnd(_roundId);
            }
        }
        {
            agent.burn(msg.sender, _agentId);
            RoundSettleManageInfo storage roundSettleInfo = roundSettleManageInfo[_roundId];
            RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
            uint256 amount = Types.AGENT_MINTING_FEE;
            rewardPool.withdraw(msg.sender, amount);
            roundSettleInfo.refundedAmount += amount;
        }
    }

    /**
     * @notice 현재 라운드에서 CloseTicketRound이 가능한 남은시간을 조회한다.
     * @dev 라운드가 proceeding이 아닌 상태일 경우, 0xffffffff가 반환된다.
     * @return remainTime CloseTicketRound이 가능한 남은시간
     */
    function getRemainTimeCloseTicketRound() external view returns (uint256 remainTime) {
        remainTime = 0xffffffff;
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundId];
        if(roundStatusInfo.status == Types.RoundStatus.Proceeding) {
            uint64 startedTimeEstimated = roundStatusInfo.startedAt - (roundStatusInfo.startedAt % Types.ROUND_PERIOD);
            uint64 elapsedTime = uint64(block.timestamp) - startedTimeEstimated;
            remainTime = uint64(Types.ROUND_CLOSETICKET_AVAIL_TIME) - elapsedTime;
        }
    }
    
    /**
     * @notice 라운드의 상태(status)를 반환한다.
     * @param _roundId 라운드 ID
     * @return status 현재 라운드의 상태
     */
    function getRoundStatus(
        uint256 _roundId
    ) external view returns (Types.RoundStatus status) {
        status = roundStatusManageInfo[_roundId].status;
    }

    /**
     * @notice 사용자의 STT 토큰 잔액을 조회한다.
     * @dev STT 컨트랙트의 balanceOf 함수를 호출하여 잔액을 반환한다.
     * @param buyer 잔액을 조회할 사용자 주소
     * @return amount 사용자의 STT 토큰 잔액
     */
    function getCoinBalance(address buyer) public view returns(uint256 amount) {
        (bool success, bytes memory returnData) = managedContracts[uint8(Types.ContractTags.Stt)].staticcall(
            abi.encodeWithSelector(
                bytes4(keccak256("balanceOf(address)")),
                buyer
            )
        );
        if (!success || returnData.length != 32) {
            revert("getCoinBalance: staticcall failed");
        }
        amount = abi.decode(returnData, (uint256));
    }

    /**
     * @notice 사용자가 당첨자인지 확인한다.
     * @dev 라운드가 Claiming이어야 하며, Agent가 해당 라운드의 당첨 타입이어야 한다.
     * @param _agentId 확인할 Agent NFT ID
     * @return isWinner 당첨자 여부
     */
    function isWinner(uint256 _agentId) external view returns (bool) {
        AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
        uint256 roundIdOfAgent = agent.roundOf(_agentId);
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[roundIdOfAgent];
        if(roundStatusInfo.status != Types.RoundStatus.Claiming) {
            return false;
        }
        RoundWinnerManageInfo storage roundWinnerInfo = roundWinnerManageInfo[roundIdOfAgent];
        bytes32 winningHash = roundWinnerInfo.winningHash;
        bytes32 typeOfAgent = agent.typeOf(_agentId);
        return winningHash == typeOfAgent;
    }

    /**
     * @notice 제출된 ItemParts의 유효성을 검증한다.
     * @dev 내부 함수로, buyAgent 함수에서 호출된다.
     * - 제출된 ItemParts 개수가 올바른지 확인
     * - 각 ItemParts의 소유자가 올바른지 확인
     * - 각 ItemParts의 부위가 올바른지 확인
     * @param holder ItemParts 소유자 주소
     * @param _itemPartsIds 검증할 ItemParts ID 배열
     */
    function _checkValidItemParts(
        address holder,
        uint256[] memory _itemPartsIds
    ) internal view {
        // 제출한 ItemParts 개수 체크
        require(_itemPartsIds.length == uint8(Types.Parts.Max), "Incorrect number of ItemParts submitted");
        ItemPartsNFT itemParts = ItemPartsNFT(managedContracts[uint8(Types.ContractTags.ItemParts)]);
        for(uint i = 0; i < _itemPartsIds.length; i++) {
            // ItemParts 소유자 체크
            if(itemParts.ownerOf(_itemPartsIds[i]) != holder) {
                revert NotItemPartsOwner(holder, _itemPartsIds[i]);
            }
            // ItemParts 부위 적합성 체크
            {
                (uint partsId,,,,) = itemParts.tokenInfo(_itemPartsIds[i]);
                if(partsId != i) {
                    revert InvalidParts(_itemPartsIds[i], partsId, i);
                }
            }
        }
    }

    /**
     * @notice 라운드의 상금을 정산하고 분배한다.
     * @dev 내부 함수로, settleRound 함수에서 호출된다.
     * - 총 모금액을 기준으로 각 항목별 금액을 계산
     * - 당첨자별 상금, 기부금, 투자금, 운영비, 스테이킹 금액을 결정
     * - 즉시 출금이 필요한 항목들을 Pool에서 출금
     * @param _roundId 정산할 라운드 ID
     */
    function _settlePrize(uint256 _roundId) internal {
        RoundSettleManageInfo storage roundSettleInfo = roundSettleManageInfo[_roundId];
        {
            uint256 depositedAmount = roundSettleInfo.depositedAmount;
            uint256 winnerCount;
            {
                RoundWinnerManageInfo storage roundWinnerInfo = roundWinnerManageInfo[_roundId];
                winnerCount = roundWinnerInfo.winnerCount;
            }
            if(winnerCount > 0) {
                uint256 totalPrizePayout = (depositedAmount * Types.PRIZE_PERCENT) / 100;
                uint256 rawPerWinner = totalPrizePayout / winnerCount;
                uint256 prizePerWinner = (rawPerWinner / Types.SCALE) * Types.SCALE;
                uint256 donateAmount = (depositedAmount * Types.DONATE_PERCENT) / 100;
                uint256 corporateAmount = (depositedAmount * Types.CORPORATE_PERCENT) / 100;
                uint256 operationAmount = (depositedAmount * Types.OPERATION_PERCENT) / 100;
                uint256 stakedAmount = (depositedAmount * Types.STAKE_PERCENT) / 100;
                // 즉시 출금항목 (donate, corporate, stake, operation)
                RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
                if(donateAmount > 0) {
                    rewardPool.withdraw(donateAddr, donateAmount);
                }
                if(corporateAmount > 0) {
                    rewardPool.withdraw(corporateAddr, corporateAmount);
                }
                if(operationAmount > 0) {
                    rewardPool.withdraw(operationAddr, operationAmount);
                }
                if(stakedAmount > 0) {
                    rewardPool.withdraw(managedContracts[uint8(Types.ContractTags.StakePool)], stakedAmount);
                }
                
                roundSettleInfo.prizePerWinner = prizePerWinner;
                roundSettleInfo.donateAmount = donateAmount;
                roundSettleInfo.corporateAmount = corporateAmount;
                roundSettleInfo.operationAmount = operationAmount;
                roundSettleInfo.stakedAmount = stakedAmount;
                roundSettleInfo.totalPrizePayout = totalPrizePayout;
            } else {
                uint256 totalPrizePayout = (depositedAmount * Types.PRIZE_PERCENT) / 100;
                uint256 prizePerWinner = 0;
                uint256 donateAmount = (depositedAmount * Types.DONATE_PERCENT) / 100;
                uint256 corporateAmount = (depositedAmount * Types.CORPORATE_PERCENT) / 100;
                uint256 operationAmount = (depositedAmount * Types.OPERATION_PERCENT) / 100;
                uint256 stakedAmount = (depositedAmount * Types.STAKE_PERCENT) / 100;
                // 즉시 출금항목 (donate, corporate, stake, operation)
                RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
                if(donateAmount > 0) {
                    rewardPool.withdraw(donateAddr, donateAmount);
                }
                if(corporateAmount > 0) {
                    rewardPool.withdraw(corporateAddr, corporateAmount);
                }
                if(operationAmount > 0) {
                    rewardPool.withdraw(operationAddr, operationAmount);
                }
                if(stakedAmount > 0) {
                    rewardPool.withdraw(managedContracts[uint8(Types.ContractTags.StakePool)], stakedAmount);
                }
                
                roundSettleInfo.prizePerWinner = prizePerWinner;
                roundSettleInfo.donateAmount = donateAmount;
                roundSettleInfo.corporateAmount = corporateAmount;
                roundSettleInfo.operationAmount = operationAmount;
                roundSettleInfo.stakedAmount = stakedAmount;
                roundSettleInfo.totalPrizePayout = 0;
                // 상금은 다음라운드로 즉시 이월된다. (묻고 따블로가!)
                RoundSettleManageInfo storage nextRoundSettleInfo = roundSettleManageInfo[_roundId+1];
                nextRoundSettleInfo.depositedAmount = totalPrizePayout;
            }
            
            
        }
    }

    /**
     * @notice 라운드 종료 시 남은 금액을 이월 처리한다.
     * @dev 내부 함수로, endRound, claim, refund 함수에서 호출된다.
     * - 총 모금액과 지출된 금액의 차이를 계산
     * - 금액 불일치가 있으면 에러를 발생시킴
     * - 남은 금액을 StakePool로 이월
     * @param _roundId 이월 처리할 라운드 ID
     */
    function _carryingOutProc(uint256 _roundId) internal {
        RoundSettleManageInfo storage roundSettleInfo = roundSettleManageInfo[_roundId];

        {
            uint256 depositedAmount = roundSettleInfo.depositedAmount;
            uint256 claimedAmount = roundSettleInfo.claimedAmount;
            uint256 donateAmount = roundSettleInfo.donateAmount;
            uint256 corporateAmount = roundSettleInfo.corporateAmount;
            uint256 operationAmount = roundSettleInfo.operationAmount;
            uint256 stakedAmount = roundSettleInfo.stakedAmount;
            uint256 spentAmount = claimedAmount + donateAmount + corporateAmount + operationAmount + stakedAmount;
            if(depositedAmount < spentAmount) {
                revert FatalAmountDiscrepancy(
                    _roundId,
                    depositedAmount,
                    claimedAmount,
                    donateAmount,
                    corporateAmount,
                    operationAmount,
                    stakedAmount
                );
            }
            uint256 carryingOutAmount = depositedAmount - spentAmount;
            if(carryingOutAmount > 0) {
                RewardPool rewardPool = RewardPool(managedContracts[uint8(Types.ContractTags.RewardPool)]);
                rewardPool.withdraw(managedContracts[uint8(Types.ContractTags.StakePool)], carryingOutAmount);
            }
        }
    }
}

