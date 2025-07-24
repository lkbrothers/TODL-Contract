const { Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");
require('dotenv').config();

// 1. Provider 및 Contract 초기화
async function initializeContracts(sttAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/SttPermit.sol/SttPermit.json").abi;
        const stt = new Contract(sttAddress, abi, provider);
        return stt;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

// 2. STT 잔액 확인
async function getSttBalance(stt, address) {
    try {
        const balance = await stt.balanceOf(address);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

// 3. STT 전송 실행
async function executeTransfer(stt, wallet, to, amount) {
    try {
        const transferTx = await stt.connect(wallet).transfer(to, amount);
        const receipt = await transferTx.wait();
        return { transaction: transferTx, receipt };
    } catch (error) {
        throw new Error(`STT 전송 실패: ${error.message}`);
    }
}

// 4. 결과 포맷팅
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

// 메인 faucet 함수 (순수 함수)
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

// 로깅 함수들 (별도로 사용)
function logContractStatus(status) {
    console.log("\n📊 STT 토큰 상태:");
    console.log("  - 전송자 잔액:", ethers.formatEther(status.senderBalance), "STT");
    console.log("  - 수신자 잔액 (전송 전):", ethers.formatEther(status.recipientBalanceBefore), "STT");
    console.log("  - 수신자 잔액 (전송 후):", ethers.formatEther(status.recipientBalanceAfter), "STT");
    console.log("  - STT 컨트랙트 주소:", status.sttAddress);
}

function logTransferResult(result) {
    console.log("\n📋 STT 전송 결과 요약:");
    console.log("  - 전송자:", result.sender);
    console.log("  - 수신자:", result.recipient);
    console.log("  - 전송량:", ethers.formatEther(result.amount), "STT");
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 전송 시간:", result.transferTime);
}

function logTransferProcess(sttAddress, wallet, to, amount, senderBalance, recipientBalanceBefore, transferTx, receipt) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("💰 STT 토큰 전송을 시작합니다...");
    console.log("🎯 STT 컨트랙트 주소:", sttAddress);
    console.log("🎨 전송자 주소:", wallet.address);
    console.log("🎯 수신자 주소:", to);
    console.log("💰 전송량:", ethers.formatEther(amount), "STT");
    console.log("📊 전송자 잔액:", ethers.formatEther(senderBalance), "STT");
    console.log("📊 수신자 잔액 (전송 전):", ethers.formatEther(recipientBalanceBefore), "STT");
    console.log("✅ STT 전송 완료! 트랜잭션 해시:", transferTx.hash);
    console.log("📦 블록 번호:", receipt.blockNumber);
}

// 모듈로 export
module.exports = { 
    faucet,
    initializeContracts,
    getSttBalance,
    executeTransfer,
    formatTransferResult,
    logContractStatus,
    logTransferResult,
    logTransferProcess
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