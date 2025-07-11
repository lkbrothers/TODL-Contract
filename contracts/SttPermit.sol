// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SttPermit Contract
 * @notice TODL 프로젝트의 STT 토큰 컨트랙트
 * @dev EIP-2612 permit 기능을 지원하는 ERC20 토큰
 * @author hlibbc
 */
contract SttPermit is ERC20Permit, Ownable {
    // def. CONSTANT
    uint256 public constant INITIAL_SUPPLY = 10_000_000_000 * 10 ** 18; /// 100억 STT

    /**
     * @notice SttPermit 컨트랙트 생성자
     * @dev 초기 공급량을 소유자에게 민팅
     */
    constructor() 
        ERC20("Status-network Test Todl Token", "STT") 
        ERC20Permit("Status-network Test Todl Token") 
        Ownable(msg.sender) 
    {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
}
