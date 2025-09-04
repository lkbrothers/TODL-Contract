/**
 * @file refund.js
 * @notice Main 컨트랙트 refund 관련 Library
 * @author hlibbc
 */
const { ethers } = require("hardhat");
require('dotenv').config();

// 1. Provider 및 Contract 초기화
async function initializeContracts(mainAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/Main.sol/Main.json").abi;
        const main = new ethers.Contract(mainAddress, abi, provider);
        return main;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * @notice Main 컨트랙트의 라운드번호를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @returns roundId
 */
async function getRoundId(main) {
    let roundId;
    
    try {
        roundId = await main.roundId();
    } catch (error) {
        roundId = null;
    }
    return roundId;
}

/**
 * @notice Agent NFT의 소유권을 확인한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} walletAddress 확인할 지갑 주소
 * @param {*} agentId 확인할 Agent ID
 * @param {*} provider Provider 객체
 * @returns 소유권 정보 (owner, isOwner, agentAddress, exists)
 */
async function checkAgentOwnership(main, walletAddress, agentId, provider) {
    try {
        const agentAddress = await main.managedContracts(2); // Agent는 2번 인덱스
        const abi = require("../../../artifacts/contracts/Agent.sol/AgentNFT.json").abi;
        const agent = new ethers.Contract(agentAddress, abi, provider);
        // Agent NFT 존재 여부 확인
        let exists = false;
        try {
            await agent.ownerOf(agentId);
            exists = true;
        } catch (error) {
            exists = false;
        }
        
        if (!exists) {
            return {
                owner: null,
                isOwner: false,
                agentAddress,
                exists: false
            };
        }
        
        const owner = await agent.ownerOf(agentId);
        const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();
        
        return {
            owner,
            isOwner,
            agentAddress,
            exists: true
        };
    } catch (error) {
        throw new Error(`Agent 소유권 확인 실패: ${error.message}`);
    }
}

/**
 * @notice Agent NFT의 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} agentId 확인할 Agent ID
 * @param {*} provider Provider 객체
 * @returns Agent 정보 (roundId, typeHash, agentAddress)
 */
async function getAgentInfo(main, agentId, provider) {
    try {
        const agentAddress = await main.managedContracts(2); // Agent는 2번 인덱스
        const abi = require("../../../artifacts/contracts/Agent.sol/AgentNFT.json").abi;
        const agent = new ethers.Contract(agentAddress, abi, provider);
        
        const roundId = await agent.roundOf(agentId);
        const typeHash = await agent.typeOf(agentId);
        
        return {
            roundId,
            typeHash,
            agentAddress
        };
    } catch (error) {
        throw new Error(`Agent 정보 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 환불 가능 여부를 확인한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 환불 가능 여부 (remainTime, isAvailable, reason)
 */
async function checkRefundAvailability(main, roundId) {
    try {
        // Main.sol의 getRemainTimeRefund 함수 호출
        const remainTime = await main.getRemainTimeRefund();
        // 0xffffffff는 status가 Claiming/Ended 상태라는 뜻 (환불 불가)
        if (remainTime === 0xffffffffn) {
            return {
                remainTime: remainTime.toString(),
                isAvailable: false,
                reason: "Status is Claiming/Ended"
            };
        }

        // 0이면 호출 가능, 0이 아닌 값은 아직 시간이 덜 됨
        const isAvailable = remainTime === 0n;

        return {
            remainTime: remainTime.toString(),
            isAvailable: isAvailable,
            reason: isAvailable ? "Ready to refund" : "Time not elapsed yet"
        };
    } catch (error) {
        throw new Error(`환불 가능 시간 확인 실패: ${error.message}`);
    }
}

/**
 * @notice refund 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} wallet 환불자 지갑
 * @param {*} roundId 라운드 ID
 * @param {*} agentId Agent ID
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executeRefund(main, wallet, roundId, agentId) {
    try {
        const refundTx = await main.connect(wallet).refund(roundId, agentId, {
            gasLimit: 500000
        });
        const receipt = await refundTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${refundTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        return { transaction: refundTx, receipt };
    } catch (error) {
        throw new Error(`refund 실행 실패: ${error.message}`);
    }
}

// 메인 refund 함수 (순수 함수)
async function refund(mainAddress, roundId, agentId, customProvider = null, customWallet = null) {
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
            const privateKey = process.env.PRIVATE_KEY;
            
            if (!privateKey) {
                throw new Error("❌ .env 파일에 PRIVATE_KEY가 설정되지 않았습니다.");
            }
            
            provider = new ethers.JsonRpcProvider(providerUrl);
            wallet = new ethers.Wallet(privateKey, provider);
        }

        console.log('wallet address: ', wallet.address)

        // 2. 컨트랙트 초기화
        const main = await initializeContracts(mainAddress, provider);
        
        // 3. 라운드번호 확인
        const currentRoundId = await getRoundId(main);
        
        // 5. Agent NFT 소유권 확인
        const ownership = await checkAgentOwnership(main, wallet.address, agentId, provider);
        
        // Agent NFT 존재 여부 확인
        if (!ownership.exists) {
            throw new Error(`❌ Agent NFT #${agentId}가 존재하지 않습니다.`);
        }
        
        // 소유권 검사
        if (!ownership.isOwner) {
            throw new Error(`❌ Agent NFT #${agentId}의 소유자가 아닙니다. 소유자: ${ownership.owner}`);
        }
        
        // 6. Agent NFT 정보 확인
        const agentInfo = await getAgentInfo(main, agentId, provider);
        
        // 9. 환불 가능 시간 확인
        const availability = await checkRefundAvailability(main, roundId);
        console.log("⏱️ Refund availability:", availability);
        
        // 10. refund 실행
        const { transaction: refundTx, receipt } = await executeRefund(main, wallet, roundId, agentId);

        // 11. 결과 포맷팅
        const result = {
            refunder: wallet.address,
            transactionHash: refundTx.hash,
            blockNumber: receipt.blockNumber,
            roundId: roundId.toString(),
            agentId: agentId.toString(),
            agentType: agentInfo.typeHash.toString(),
            refundAmount: "1000000000000000000", // 1 Token (AGENT_MINTING_FEE)
            refundTime: new Date().toISOString()
        };

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
/**
 * @notice refund 결과를 출력한다.
 * @param {*} result refund 결과물
 */
function logResult(result) {
    console.log("\n📋 Refund Reports:");
    console.log("  - 환불자:", result.refunder);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - Agent ID:", result.agentId);
    console.log("  - Agent Type:", result.agentType);
    console.log("  - 환불 금액:", result.refundAmount, "Token");
    console.log("  - 환불 시간:", result.refundTime);
}

// 모듈로 export
module.exports = { 
    refund,
    logResult
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error("❌ 사용법: node refund.js <main_contract_address> <round_id> <agent_id>");
        process.exit(1);
    }

    const mainAddress = args[0];
    const roundId = parseInt(args[1]);
    const agentId = parseInt(args[2]);

    refund(mainAddress, roundId, agentId)
        .then((result) => {
            console.log("\n🎉 refund 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ refund 실패:", error.message);
            process.exit(1);
        });
} 