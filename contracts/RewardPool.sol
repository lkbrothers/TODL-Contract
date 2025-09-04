// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

/**
 * @title RewardPool Contract
 * @notice TODL 프로젝트의 보상 풀 컨트랙트
 * @dev Token 토큰을 관리하고 EIP-2612 permit 기능을 제공
 * @author hlibbc
 */
contract RewardPool {
    // def. VARIABLE
    address public mainAddr;    /// Main 컨트랙트 주소
    IERC20 public immutable token; /// Token 토큰 컨트랙트
    IERC20Permit public immutable tokenPermit; /// Token 토큰의 Permit 인터페이스

    // def. MODIFIER
    /**
     * @notice Main 컨트랙트만 호출 가능하도록 제한
     */
    modifier onlyMain() {
        require(msg.sender == mainAddr, "Not Main contract");
        _;
    }

    /**
     * @notice RewardPool 컨트랙트 생성자
     * @param _mainAddr Main 컨트랙트 주소
     * @param _tokenAddr Token 토큰 컨트랙트 주소
     */
    constructor(
        address _mainAddr, 
        address _tokenAddr
    ) {
        require(_mainAddr != address(0), "Invalid main address");
        require(_tokenAddr != address(0), "Invalid token address");
        mainAddr = _mainAddr;
        token = IERC20(_tokenAddr);
        tokenPermit = IERC20Permit(_tokenAddr); // cast to permit interface
    }

    /**
     * @notice EIP-2612 permit + transferFrom in one step (with signature)
     * @param _from 토큰 소유자 (서명자)
     * @param _amount 입금할 금액 (단위: wei)
     * @param _deadline permit 유효시간 (timestamp)
     * @param _permitSig EIP-2612 permit signature (bytes)
     */
    function deposit(
        address _from,
        uint256 _amount,
        uint256 _deadline,
        bytes calldata _permitSig
    ) external onlyMain {
        require(_from != address(0), "Invalid sender");
        require(_amount > 0, "Zero amount");

        // calldata → memory 복사 후 v, r, s 추출
        bytes memory sig = _permitSig;
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(sig);

        // 1. permit
        tokenPermit.permit(_from, address(this), _amount, _deadline, v, r, s);

        // 2. transferFrom
        require(token.transferFrom(_from, address(this), _amount), "Transfer failed");
    }


    /**
     * @notice Main 컨트랙트가 Pool에 쌓인 Token를 특정 주소로 송금
     * @param _to 출금받을 주소
     * @param _amount 출금할 금액
     */
    function withdraw(
        address _to, 
        uint256 _amount
    ) external onlyMain {
        require(_to != address(0), "Invalid receiver");
        require(_amount > 0, "Zero amount");
        require(token.balanceOf(address(this)) >= _amount, "Insufficient balance");

        require(token.transfer(_to, _amount), "Withdraw failed");
    }
    /**
     * @notice 현재 Pool 컨트랙트가 보유 중인 Token 잔액
     * @return Pool의 Token 잔액
     */
    function getDepositAmounts() public view returns (uint256) {
        return token.balanceOf(address(this));
    }
    /**
     * @notice bytes 서명을 v, r, s로 분해합니다 (EIP-2612 등에서 사용)
     * @param _sig 서명 (총 65 바이트: r(32) + s(32) + v(1))
     * @return v 서명 구성 요소(v)
     * @return r 서명 구성 요소(r)
     * @return s 서명 구성 요소(s)
     */
    function _splitSignature(
        bytes memory _sig
    ) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        require(_sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := byte(0, mload(add(_sig, 96)))
        }
    }
}
