/**
 * @file faucet.js
 * @notice Token 토큰 faucet 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

/**
 * @notice Token 컨트랙트를 초기화한다.
 * @param {*} tokenAddress Token 컨트랙트 주소
 * @param {*} provider Provider 객체
 * @returns Token 컨트랙트 인스턴스
 */
async function initializeContracts(tokenAddress, provider) {
    try {
        let abiPath;
        if(process.env.USE_STABLE_COIN == '1') {
            abiPath = "../../../artifacts/contracts/StableCoin.sol/StableCoin.json";
        } else {
            abiPath = "../../../artifacts/contracts/SttPermit.sol/SttPermit.json";
        }
        const abi = require(abiPath).abi;
        const token = new Contract(tokenAddress, abi, provider);
        return token;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * @notice Token 토큰 잔액을 확인한다.
 * @param {*} token Token 컨트랙트 인스턴스
 * @param {*} address 주소
 * @returns Token 토큰 잔액
 */
async function getTokenBalance(token, address) {
    try {
        const balance = await token.balanceOf(address);
        return balance;
    } catch (error) {
        throw new Error(`Token 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * @notice Token 토큰 전송을 실행한다.
 * @param {*} token Token 컨트랙트 인스턴스
 * @param {*} wallet 전송자 지갑
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executeTransfer(token, wallet, to, amount) {
    try {
        const transferTx = await token.connect(wallet).transfer(to, amount, {
            gasLimit: 1000000
        });
        const receipt = await transferTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${transferTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        return { transaction: transferTx, receipt };
    } catch (error) {
        throw new Error(`Token 전송 실패: ${error.message}`);
    }
}

/**
 * @notice Token 전송 결과를 포맷팅한다.
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
 * @notice Token 토큰을 전송한다.
 * @param {*} tokenAddress Token 컨트랙트 주소
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @param {*} customProvider 커스텀 Provider (optional)
 * @param {*} customWallet 커스텀 Wallet (optional)
 * @returns Token 전송 결과
 */
async function faucet(tokenAddress, to, amount, customProvider = null, customWallet = null) {
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

        console.log('amount: ', amount)

        // 2. 컨트랙트 초기화
        const token = await initializeContracts(tokenAddress, provider);
        const DECIMALS = await token.decimals();
        let weiAmount = ethers.parseUnits(amount, DECIMALS);

        console.log('DECIMALS: ', DECIMALS)
        
        // 3. 전송자 Token 잔액 확인
        const senderBalance = await getTokenBalance(token, wallet.address);
        if(senderBalance < weiAmount) {
            throw new Error("❌ 보유 금액이 너무 작습니다.");
        }
        
        // 4. 수신자 Token 잔액 확인 (전송 전)
        const recipientBalanceBefore = await getTokenBalance(token, to);
        
        // 5. Token 전송 실행
        const { transaction: transferTx, receipt } = await executeTransfer(token, wallet, to, weiAmount);
        
        // 6. 수신자 Token 잔액 확인 (전송 후)
        const recipientBalanceAfter = await getTokenBalance(token, to);

        // 7. 결과 포맷팅
        const result = {
            sender: wallet.address,
            recipient: to,
            balanceBefore: recipientBalanceBefore,
            amount: weiAmount.toString(),
            balanceAfter: recipientBalanceAfter,
            transactionHash: transferTx.hash,
            blockNumber: receipt.blockNumber,
            decimals: Number(DECIMALS)
        }

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
    console.log("  - 수신전 balance:", ethers.formatUnits(result.balanceBefore, result.decimals), "Token");
    console.log("  - 전송량:", ethers.formatUnits(result.amount, result.decimals), "Token");
    console.log("  - 수신후 balance:", ethers.formatUnits(result.balanceAfter, result.decimals), "Token");
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
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

    const tokenAddress = args[0];
    const to = args[1];
    const amount = ethers.parseEther(args[2]);

    faucet(tokenAddress, to, amount)
        .then((result) => {
            console.log("\n🎉 Token 전송 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ Token 전송 실패:", error.message);
            process.exit(1);
        });
} 