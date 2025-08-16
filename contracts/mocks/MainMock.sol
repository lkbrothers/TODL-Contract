// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../Main.sol";

contract MainMock is Main {

    constructor(
        address[] memory _admins, 
        address _donate, 
        address _corporate, 
        address _operations
    ) Main(_admins, _donate, _corporate, _operations) {}

    /**
     * @notice 당첨 Agent NFT를 강제로 조작하여 정산한다.
     * @dev 당첨이후 동작 테스트를 위해 인위적으로 당첨 NFT를 조작하기 위한 함수
     * 이 코드는 테스트코드 -> REAL version에서는 사용금지!
     * @param _roundId 라운드 번호
     * @param _winnerHash 당첨 Agent NFT의 typeHash
     */
    function settleRoundForced(uint32 _roundId, bytes32 _winnerHash) external onlyAdmin {
        RoundWinnerManageInfo storage roundWinnerInfo = roundWinnerManageInfo[_roundId];
        roundWinnerInfo.winningHash = _winnerHash;
        AgentNFT agent = AgentNFT(managedContracts[uint8(Types.ContractTags.Agent)]);
        (uint mintCount,) = agent.mintTypeCountPerRound(roundId, roundWinnerInfo.winningHash); // 최종 당첨자 수
        roundWinnerInfo.winnerCount = mintCount;
        RoundStatusManageInfo storage roundStatusInfo = roundStatusManageInfo[_roundId];
        roundStatusInfo.status = Types.RoundStatus.Claiming;
        roundStatusInfo.settledAt = uint64(block.timestamp);
        {
            (uint256 donateAmount,
            uint256 corporateAmount,
            uint256 operationAmount,
            uint256 stakedAmount) = _settlePrize(_roundId); // 분배할 금액 정산
            emit RoundSettled(
                roundId,
                _winnerHash,
                donateAmount,
                corporateAmount,
                operationAmount,
                stakedAmount
            );
        }
    }
}