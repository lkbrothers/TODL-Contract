// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ETHBatchSender
 * @notice Multiple User에게 ETH를 Batch로 전송하기 위한 컨트랙트
 * @dev 루프는 최대 100회로 제한한다.
 * @author hlibbc
 */
contract ETHBatchSender {
    error MismatchArrayLength();
    error InsufficientValue();
    error TransferFailed(address to, uint256 amount);

    /**
     * @notice 다수의 수신자에게 각각 지정된 ETH를 전송합니다.
     * @param recipients 수신자 주소 배열
     * @param amounts 각 수신자에게 보낼 ETH 금액 배열 (단위: wei)
     */
    function sendETHBatch(
        address[] calldata recipients, 
        uint256[] calldata amounts
    ) external payable {
        uint256 len = recipients.length;
        if (len != amounts.length) {
            revert MismatchArrayLength();
        }

        uint256 total = 0;
        for (uint256 i = 0; i < len; i++) {
            total += amounts[i];
        }

        if (msg.value < total) {
            revert InsufficientValue();
        }

        for (uint256 i = 0; i < len; i++) {
            (bool sent, ) = payable(recipients[i]).call{value: amounts[i]}("");
            if (!sent) revert TransferFailed(recipients[i], amounts[i]);
        }

        // 남은 잔액은 되돌려줌 (오버페이 방지)
        uint256 leftover = msg.value - total;
        if (leftover > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: leftover}("");
            require(refunded, "Refund failed");
        }
    }

    /**
     * @notice 다수의 수신자에게 동일한 ETH를 전송합니다.
     * @param recipients 수신자 주소 배열
     * @param amount 각 수신자에게 동일하게 보낼 ETH 금액
     */
    function sendETHBatch(address[] calldata recipients, uint256 amount) external payable {
        uint256 len = recipients.length;
        uint256 total = amount * len;

        if (msg.value < total) {
            revert InsufficientValue();
        }

        for (uint256 i = 0; i < len; i++) {
            (bool sent, ) = payable(recipients[i]).call{value: amount}("");
            if (!sent) {
                revert TransferFailed(recipients[i], amount);
            }
        }

        // 남은 잔액은 되돌려줌 (오버페이 방지)
        uint256 leftover = msg.value - total;
        if (leftover > 0) {
            (bool refunded, ) = payable(msg.sender).call{value: leftover}("");
            require(refunded, "Refund failed");
        }
    }
}
