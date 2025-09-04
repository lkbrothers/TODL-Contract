// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Types Library
 * @notice 공통으로 사용되는 enum 및 struct 정의
 * @dev 각 enum에는 출력 시 가시성 확보를 위한 문자열 변환함수 추가
 * @author hlibbc
 */
library Types {
    /**
     * @notice 라운드상태를 정의
     * @dev 라운드는 기본적으로 1일 단위로 진행됨
     * 환불중 부연설명: 
     *  정산이 일어나지 않은 상태에서 ROUND_PERIOD*2가 경과할 경우, refund 수행가능
     *  최초 refund가 일어나면 Refunding 상태로 천이
     *  refunding 상태에서 payoutLimitTime (default: 30 days) 후 Ended 상태로 천이가능
     */
    enum RoundStatus { 
        NotStarted, /// 라운드 시작전
        Proceeding, /// 진행중: startRound 에 의해 천이 (UTC00:00 ~ 22:59)
        Drawing,    /// 개표중: closeTicketRound 에 의해 천이 (UTC23:00 ~ 23:59)
        Claiming,   /// 당첨금수령중: settleRound 에 의해 천이
        Refunding,  /// 환불중: @dev 참조,
        Ended       /// 종료: Claiming 혹은 Refunding 시점부터 payoutLimitTime (default: 30 days) 후 Ended 상태로 천이가능
    }

    /**
     * @notice 컨트랙트 태그
     * @dev 총 6개 확정
     */
    enum ContractTags {
        Main,       /// Main 컨트랙트
        ItemParts,  /// 파츠 NFT
        Agent,      /// Agent NFT
        Rng,        /// RNG (랜덤생성 관리)
        RewardPool, /// RewardPool (자금 관리)
        StakePool,  /// 스테이킹 Pool
        Reserv,     /// 이월금액 저장용
        Token,      /// 재화로 사용될 토큰 (USDT, USDC, STT, ...)
        Max         /// End-of-enum
    }

    /**
     * @notice ItemParts 부위별 enum
     * @dev 순서 변경에 유동적이 될 수 있도록 enum으로 정의
     */
    enum Parts {
        Head,   /// 머리
        Body,   /// 몸통
        Legs,   /// 다리
        RHand,  /// 오른손
        LHand,  /// 왼손
        Max     /// End-of-enum
    }

    /**
     * @notice ItemParts 기원별 enum
     * @dev NFT의 기원을 정의
     */
    enum Origins {
        Todl,      /// TODL
        Earthling, /// Earthling
        BadGen,    /// BadGen
        Max        /// End-of-enum
    }

    /**
     * @notice ItemParts 세트 번호별 enum
     * @dev NFT의 세트 번호를 정의
     */
    enum SetNums {
        One,    /// 세트 1
        Two,    /// 세트 2
        Three,  /// 세트 3
        Four,   /// 세트 4
        Max     /// End-of-enum
    }

    // def. STRUCT
    /**
     * @notice 민팅 타입 정보 구조체
     * @dev ItemParts NFT의 민팅 정보를 저장
     */
    struct MintTypeInfo {
        uint256 partsIndex;    /// Parts 인덱스
        uint256 originsIndex;  /// Origins 인덱스
        uint256 setNumsIndex;  /// SetNums 인덱스
        bytes32 typeHash;      /// 타입 해시값
        string typeName;       /// 타입명
    }

    /**
     * @notice NFT 카운트 정보 구조체
     * @dev NFT의 민팅/소각 개수를 추적
     */
    struct NftCounts {
        uint256 mintCount; /// 민팅 개수
        uint256 burnCount; /// 소각 개수
    }

    // def. CONSTANT
    uint64  public constant ROUND_PERIOD = 86400; // 라운드주기: 1일
    uint64  public constant ROUND_CLOSETICKET_AVAIL_TIME = 82800; // 라운드종료시점 (UTC23:00)
    uint64  public constant ROUND_REFUND_AVAIL_TIME = ROUND_PERIOD * 2; // 환불가능시점 (2일)
    uint64  public constant ROUND_PAYOUT_LIMIT_TIME = 30 days; // 클레임 혹은 환불을 수행할 수 있는 기간 (30일)
    uint256 public constant AGENT_MINTING_FEE = 1 ether; // Agent 민팅비: 1 Token
    uint256 public constant PRIZE_PERCENT = 70; // 당첨금 지급 퍼센트
    uint256 public constant DONATE_PERCENT = 10; // 기부금 지급 퍼센트
    uint256 public constant CORPORATE_PERCENT = 10; // 투자금 지급 퍼센트
    uint256 public constant OPERATION_PERCENT = 5; // 운영비 지급 퍼센트
    uint256 public constant STAKE_PERCENT = 5; // 스테이킹 지급 퍼센트
    uint256 public constant SCALE = 1e15; // 소수점 셋째자리까지 절삭
}