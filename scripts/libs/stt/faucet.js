/**
 * @file faucet.js
 * @notice STT 토큰 faucet 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");
require('dotenv').config();

/**
 * @notice STT 컨트랙트를 초기화한다.
 * @param {*} sttAddress STT 컨트랙트 주소
 * @param {*} provider Provider 객체
 * @returns STT 컨트랙트 인스턴스
 */
async function initializeContracts(sttAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/SttPermit.sol/SttPermit.json").abi;
        const stt = new Contract(sttAddress, abi, provider);
        return stt;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * @notice STT 토큰 잔액을 확인한다.
 * @param {*} stt STT 컨트랙트 인스턴스
 * @param {*} address 주소
 * @returns STT 토큰 잔액
 */
async function getSttBalance(stt, address) {
    try {
        const balance = await stt.balanceOf(address);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * @notice STT 토큰 전송을 실행한다.
 * @param {*} stt STT 컨트랙트 인스턴스
 * @param {*} wallet 전송자 지갑
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executeTransfer(stt, wallet, to, amount) {
    try {
        const transferTx = await stt.connect(wallet).transfer(to, amount);
        const receipt = await transferTx.wait();
        return { transaction: transferTx, receipt };
    } catch (error) {
        throw new Error(`STT 전송 실패: ${error.message}`);
    }
}

/**
 * @notice STT 전송 결과를 포맷팅한다.
 * @param {*} wallet 전송자 지갑
 * @param {*} transferTx 전송 트랜잭션
 * @param {*} receipt 트랜잭션 영수증
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @param {*} contractStatus 컨트랙트 상태 정보
 * @returns 포맷팅된 전송 결과
 */
function formatTransferResult(wallet, transferTx, receipt, to, amount, contractStatus) {
    return {
        sender: wallet.address,
        recipient: to,
        amount: amount.toString(),
        transactionHash: transferTx.hash,
        blockNumber: receipt.blockNumber,
        transferTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
}

/**
 * @notice STT 토큰을 전송한다.
 * @param {*} sttAddress STT 컨트랙트 주소
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @param {*} customProvider 커스텀 Provider (optional)
 * @param {*} customWallet 커스텀 Wallet (optional)
 * @returns STT 전송 결과
 */
async function faucet(sttAddress, to, amount, customProvider = null, customWallet = null) {
    try {
        // 1. Provider 및 Wallet 설정
        let provider, wallet;
        
        if (customProvider && customWallet) {
            // MetaMask 연동 시 사용할 수 있는 커스텀 provider/wallet
            provider = customProvider;
            wallet = customWallet;
        } else {
            // 현재 .env 기반 설정
            const providerUrl = process.env.PROVIDER_URL || "http://localhost:8545";
            const ownerKey = process.env.OWNER_KEY;
            
            if (!ownerKey) {
                throw new Error("❌ .env 파일에 OWNER_KEY가 설정되지 않았습니다.");
            }
            
            provider = new JsonRpcProvider(providerUrl);
            wallet = new Wallet(ownerKey, provider);
        }

        // 2. 컨트랙트 초기화
        const stt = await initializeContracts(sttAddress, provider);
        
        // 3. 전송자 STT 잔액 확인
        const senderBalance = await getSttBalance(stt, wallet.address);
        
        // 4. 수신자 STT 잔액 확인 (전송 전)
        const recipientBalanceBefore = await getSttBalance(stt, to);
        
        // 5. STT 전송 실행
        const { transaction: transferTx, receipt } = await executeTransfer(stt, wallet, to, amount);
        
        // 6. 수신자 STT 잔액 확인 (전송 후)
        const recipientBalanceAfter = await getSttBalance(stt, to);

        // 7. 컨트랙트 상태 정보
        const contractStatus = {
            senderBalance: senderBalance.toString(),
            recipientBalanceBefore: recipientBalanceBefore.toString(),
            recipientBalanceAfter: recipientBalanceAfter.toString(),
            sttAddress: sttAddress
        };

        // 8. 결과 포맷팅
        const result = formatTransferResult(wallet, transferTx, receipt, to, amount, contractStatus);

        return result;

    } catch (error) {
        throw error;
    }
}

/**
 * @notice faucet 결과를 출력한다.
 * @param {*} result faucet 결과물
 */
function logResult(result) {
    console.log("\n📋 Faucet Reports:");
    console.log("  - 전송자:", result.sender);
    console.log("  - 수신자:", result.recipient);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 전송량:", ethers.formatEther(result.amount), "STT");
    console.log("  - 전송 시간:", result.transferTime);
}

// 모듈로 export
module.exports = { 
    faucet,
    logResult
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error("❌ 사용법: node faucet.js <stt_contract_address> <to_address> <amount_in_ether>");
        console.error("예시: node faucet.js 0x123... 0x456... 10");
        process.exit(1);
    }

    const sttAddress = args[0];
    const to = args[1];
    const amount = ethers.parseEther(args[2]);

    faucet(sttAddress, to, amount)
        .then((result) => {
            console.log("\n🎉 STT 전송 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ STT 전송 실패:", error.message);
            process.exit(1);
        });
} 