// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Reserv Contract
 * @notice TODL 프로젝트의 이월금액을 관리하기 위한 컨트랙트
 * @author hlibbc
 */
contract Reserv is Ownable {
    // def. VARIABLE
    IERC20 public immutable stt; /// STT 토큰 컨트랙트

    // def. EVENT
    /**
     * @notice 토큰 출금 이벤트
     * @param to 출금받을 주소
     * @param amount 출금된 금액
     */
    event Withdrawn(address indexed to, uint256 amount);

    /**
     * @notice RewardPool 컨트랙트 생성자
     * @param _sttAddr STT 토큰 컨트랙트 주소
     */
    constructor(
        address _sttAddr
    ) Ownable(msg.sender) {
        require(_sttAddr != address(0), "Invalid token address");
        stt = IERC20(_sttAddr);
    }

    /**
     * @notice Reserv에 쌓인 STT를 특정 주소로 송금
     * @param _to 출금받을 주소
     * @param _amount 출금할 금액
     */
    function withdraw(
        address _to, 
        uint256 _amount
    ) external onlyOwner {
        require(_to != address(0), "Invalid receiver");
        require(_amount > 0, "Zero amount");
        require(stt.balanceOf(address(this)) >= _amount, "Insufficient balance");
        require(stt.transfer(_to, _amount), "Withdraw failed");
        emit Withdrawn(_to, _amount);
    }
    /**
     * @notice 현재 Pool 컨트랙트가 보유 중인 STT 잔액
     * @return Pool의 STT 잔액
     */
    function getDepositAmounts() public view returns (uint256) {
        return stt.balanceOf(address(this));
    }
}
