// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SttBatchSender
 * @dev ERC20 토큰을 배치로 전송할 수 있는 컨트랙트
 */
contract SttBatchSender is Ownable, ReentrancyGuard {
    
    // 이벤트 정의
    event BatchTransfer(
        address indexed token,
        address indexed sender,
        uint256 totalAmount,
        uint256 recipientCount
    );
    
    event TransferFailed(
        address indexed recipient,
        address indexed token,
        uint256 amount,
        string reason
    );
    
    // 전송 실패 정보를 저장하는 구조체
    struct TransferResult {
        address recipient;
        uint256 amount;
        bool success;
        string reason;
    }
    
    // 배치 전송 결과를 저장하는 구조체
    struct BatchTransferResult {
        uint256 totalAmount;
        uint256 successCount;
        uint256 failureCount;
        TransferResult[] results;
    }

    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev 단일 토큰을 여러 주소로 배치 전송
     * @param token 전송할 ERC20 토큰 주소
     * @param recipients 수신자 주소 배열
     * @param amounts 각 수신자에게 전송할 금액 배열
     * @return result 배치 전송 결과
     */
    function batchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external nonReentrant returns (BatchTransferResult memory result) {
        require(recipients.length > 0, "Recipients array cannot be empty");
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        IERC20 tokenContract = IERC20(token);
        uint256 totalAmount = 0;
        
        // 총 전송 금액 계산
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }
        
        // 토큰 승인 확인
        require(
            tokenContract.allowance(msg.sender, address(this)) >= totalAmount,
            "Insufficient allowance"
        );
        
        // 토큰을 컨트랙트로 전송
        require(
            tokenContract.transferFrom(msg.sender, address(this), totalAmount),
            "Transfer to contract failed"
        );
        
        // 배치 전송 실행
        result = _executeBatchTransfer(tokenContract, recipients, amounts);
        
        emit BatchTransfer(token, msg.sender, totalAmount, recipients.length);
        
        return result;
    }
    
    /**
     * @dev 여러 토큰을 여러 주소로 배치 전송
     * @param tokens 전송할 ERC20 토큰 주소 배열
     * @param recipients 수신자 주소 배열
     * @param amounts 각 토큰별, 수신자별 전송 금액 2차원 배열
     * @return results 각 토큰별 배치 전송 결과
     */
    function batchTransferMultipleTokens(
        address[] calldata tokens,
        address[] calldata recipients,
        uint256[][] calldata amounts
    ) external nonReentrant returns (BatchTransferResult[] memory results) {
        require(tokens.length > 0, "Tokens array cannot be empty");
        require(tokens.length == amounts.length, "Tokens and amounts arrays length mismatch");
        require(recipients.length > 0, "Recipients array cannot be empty");
        
        results = new BatchTransferResult[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(amounts[i].length == recipients.length, "Amounts array length mismatch");
            
            IERC20 tokenContract = IERC20(tokens[i]);
            uint256 totalAmount = 0;
            
            // 총 전송 금액 계산
            for (uint256 j = 0; j < amounts[i].length; j++) {
                totalAmount += amounts[i][j];
            }
            
            // 토큰 승인 확인
            require(
                tokenContract.allowance(msg.sender, address(this)) >= totalAmount,
                "Insufficient allowance for token"
            );
            
            // 토큰을 컨트랙트로 전송
            require(
                tokenContract.transferFrom(msg.sender, address(this), totalAmount),
                "Transfer to contract failed"
            );
            
            // 배치 전송 실행
            results[i] = _executeBatchTransfer(tokenContract, recipients, amounts[i]);
            
            emit BatchTransfer(tokens[i], msg.sender, totalAmount, recipients.length);
        }
        
        return results;
    }
    
    /**
     * @dev 배치 전송 실행 (내부 함수)
     * @param tokenContract 전송할 토큰 컨트랙트
     * @param recipients 수신자 주소 배열
     * @param amounts 각 수신자에게 전송할 금액 배열
     * @return result 배치 전송 결과
     */
    function _executeBatchTransfer(
        IERC20 tokenContract,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) internal returns (BatchTransferResult memory result) {
        result.results = new TransferResult[](recipients.length);
        result.successCount = 0;
        result.failureCount = 0;
        result.totalAmount = 0;
        
        for (uint256 i = 0; i < recipients.length; i++) {
            result.results[i].recipient = recipients[i];
            result.results[i].amount = amounts[i];
            result.totalAmount += amounts[i];
            
            try tokenContract.transfer(recipients[i], amounts[i]) {
                result.results[i].success = true;
                result.results[i].reason = "";
                result.successCount++;
            } catch Error(string memory reason) {
                result.results[i].success = false;
                result.results[i].reason = reason;
                result.failureCount++;
                
                emit TransferFailed(recipients[i], address(tokenContract), amounts[i], reason);
            } catch {
                result.results[i].success = false;
                result.results[i].reason = "Unknown error";
                result.failureCount++;
                
                emit TransferFailed(recipients[i], address(tokenContract), amounts[i], "Unknown error");
            }
        }
        
        return result;
    }
    
    /**
     * @dev 컨트랙트에 남아있는 토큰을 소유자에게 반환
     * @param token 반환할 토큰 주소
     */
    function withdrawTokens(address token) external onlyOwner {
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        require(
            tokenContract.transfer(owner(), balance),
            "Withdrawal failed"
        );
    }
    
    /**
     * @dev 컨트랙트에 남아있는 ETH를 소유자에게 반환
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = owner().call{value: balance}("");
        require(success, "ETH withdrawal failed");
    }
    
    /**
     * @dev 토큰 잔액 조회
     * @param token 조회할 토큰 주소
     * @return balance 토큰 잔액
     */
    function getTokenBalance(address token) external view returns (uint256 balance) {
        return IERC20(token).balanceOf(address(this));
    }
    
    /**
     * @dev ETH 잔액 조회
     * @return balance ETH 잔액
     */
    function getETHBalance() external view returns (uint256 balance) {
        return address(this).balance;
    }
    
    /**
     * @dev 배치 전송 결과 조회
     * @param token 토큰 주소
     * @param recipients 수신자 주소 배열
     * @param amounts 각 수신자에게 전송할 금액 배열
     * @return result 시뮬레이션된 배치 전송 결과
     */
    function simulateBatchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external view returns (BatchTransferResult memory result) {
        require(recipients.length > 0, "Recipients array cannot be empty");
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        IERC20 tokenContract = IERC20(token);
        result.results = new TransferResult[](recipients.length);
        result.successCount = 0;
        result.failureCount = 0;
        result.totalAmount = 0;
        
        for (uint256 i = 0; i < recipients.length; i++) {
            result.results[i].recipient = recipients[i];
            result.results[i].amount = amounts[i];
            result.totalAmount += amounts[i];
            
            // 잔액 확인
            uint256 balance = tokenContract.balanceOf(address(this));
            if (balance >= amounts[i]) {
                result.results[i].success = true;
                result.results[i].reason = "";
                result.successCount++;
            } else {
                result.results[i].success = false;
                result.results[i].reason = "Insufficient balance";
                result.failureCount++;
            }
        }
        
        return result;
    }
}
