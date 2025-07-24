const { Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");
require('dotenv').config();

// 1. Provider 및 Contract 초기화
async function initializeContracts(mainAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/Main.sol/Main.json").abi;
        const main = new Contract(mainAddress, abi, provider);
        return main;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

// 2. 컨트랙트 상태 확인
async function getContractStatus(main) {
    const status = {};
    
    try {
        status.roundId = await main.roundId();
    } catch (error) {
        status.roundId = null;
    }
    
    try {
        status.donateAddr = await main.donateAddr();
    } catch (error) {
        status.donateAddr = null;
    }
    
    try {
        status.corporateAddr = await main.corporateAddr();
    } catch (error) {
        status.corporateAddr = null;
    }
    
    try {
        status.operationAddr = await main.operationAddr();
    } catch (error) {
        status.operationAddr = null;
    }
    
    return status;
}

// 3. 라운드 상태 확인
async function getRoundStatus(main, roundId) {
    try {
        const status = await main.getRoundStatus(roundId);
        return status;
    } catch (error) {
        throw new Error(`라운드 상태 확인 실패: ${error.message}`);
    }
}

// 4. Agent NFT 소유권 확인
async function checkAgentOwnership(main, walletAddress, agentId) {
    try {
        const agentAddress = await main.managedContracts(0); // Agent는 0번 인덱스
        const abi = require("../../../artifacts/contracts/Agent.sol/AgentNFT.json").abi;
        const agent = new Contract(agentAddress, abi, main.provider);
        
        const owner = await agent.ownerOf(agentId);
        const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();
        
        return {
            owner,
            isOwner,
            agentAddress
        };
    } catch (error) {
        throw new Error(`Agent 소유권 확인 실패: ${error.message}`);
    }
}

// 5. Agent NFT 정보 확인
async function getAgentInfo(main, agentId) {
    try {
        const agentAddress = await main.managedContracts(0); // Agent는 0번 인덱스
        const abi = require("../../../artifacts/contracts/Agent.sol/AgentNFT.json").abi;
        const agent = new Contract(agentAddress, abi, main.provider);
        
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

// 6. 라운드 정보 확인
async function getRoundInfo(main, roundId) {
    try {
        const roundInfo = await main.roundStatusManageInfo(roundId);
        return roundInfo;
    } catch (error) {
        throw new Error(`라운드 정보 확인 실패: ${error.message}`);
    }
}

// 7. 라운드 정산 정보 확인
async function getRoundSettleInfo(main, roundId) {
    try {
        const settleInfo = await main.roundSettleManageInfo(roundId);
        return settleInfo;
    } catch (error) {
        throw new Error(`라운드 정산 정보 확인 실패: ${error.message}`);
    }
}

// 8. 환불 가능 시간 확인
async function checkRefundAvailability(main, roundId) {
    try {
        const roundInfo = await getRoundInfo(main, roundId);
        const startedAt = roundInfo.startedAt;
        const currentTime = Math.floor(Date.now() / 1000);
        
        // Types.ROUND_REFUND_AVAIL_TIME은 24시간 (86400초)
        const ROUND_REFUND_AVAIL_TIME = 86400;
        const timeElapsed = currentTime - startedAt;
        
        return {
            currentTime,
            startedAt,
            timeElapsed,
            isAvailable: timeElapsed > ROUND_REFUND_AVAIL_TIME
        };
    } catch (error) {
        throw new Error(`환불 가능 시간 확인 실패: ${error.message}`);
    }
}

// 9. refund 실행
async function executeRefund(main, wallet, roundId, agentId) {
    try {
        const refundTx = await main.connect(wallet).refund(roundId, agentId);
        const receipt = await refundTx.wait();
        return { transaction: refundTx, receipt };
    } catch (error) {
        throw new Error(`refund 실행 실패: ${error.message}`);
    }
}

// 10. 결과 포맷팅
function formatRefundResult(wallet, refundTx, receipt, roundId, agentId, contractStatus) {
    return {
        refunder: wallet.address,
        transactionHash: refundTx.hash,
        blockNumber: receipt.blockNumber,
        roundId: roundId.toString(),
        agentId: agentId.toString(),
        refundTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
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
            
            provider = new JsonRpcProvider(providerUrl);
            wallet = new Wallet(privateKey, provider);
        }

        // 2. 컨트랙트 초기화
        const main = await initializeContracts(mainAddress, provider);
        
        // 3. 컨트랙트 상태 확인
        const contractStatus = await getContractStatus(main);
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        
        // 5. Agent NFT 소유권 확인
        const ownership = await checkAgentOwnership(main, wallet.address, agentId);
        
        // 6. Agent NFT 정보 확인
        const agentInfo = await getAgentInfo(main, agentId);
        
        // 7. 라운드 정보 확인
        const roundInfo = await getRoundInfo(main, roundId);
        
        // 8. 라운드 정산 정보 확인
        const settleInfo = await getRoundSettleInfo(main, roundId);
        
        // 9. 환불 가능 시간 확인
        const availability = await checkRefundAvailability(main, roundId);
        
        // 10. refund 실행
        const { transaction: refundTx, receipt } = await executeRefund(main, wallet, roundId, agentId);

        // 11. 결과 포맷팅
        const result = formatRefundResult(wallet, refundTx, receipt, roundId, agentId, contractStatus);

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
function logContractStatus(status) {
    console.log("\n📊 현재 컨트랙트 상태:");
    if (status.roundId !== null) {
        console.log("  - 현재 라운드 ID:", status.roundId.toString());
    } else {
        console.log("  - 현재 라운드 ID: 확인 불가");
    }
    
    if (status.donateAddr !== null) {
        console.log("  - 기부 주소:", status.donateAddr);
    } else {
        console.log("  - 기부 주소: 확인 불가");
    }
    
    if (status.corporateAddr !== null) {
        console.log("  - 영리법인 주소:", status.corporateAddr);
    } else {
        console.log("  - 영리법인 주소: 확인 불가");
    }
    
    if (status.operationAddr !== null) {
        console.log("  - 운영비 주소:", status.operationAddr);
    } else {
        console.log("  - 운영비 주소: 확인 불가");
    }
}

function logRoundStatus(roundStatus) {
    console.log("\n🎯 라운드 상태:");
    const statusNames = ["NotStarted", "Proceeding", "Drawing", "Claiming", "Refunding", "Ended"];
    console.log("  - 상태:", statusNames[roundStatus] || "Unknown");
}

function logAgentOwnership(ownership) {
    console.log("\n🎨 Agent NFT 소유권:");
    console.log("  - 소유자:", ownership.owner);
    console.log("  - 호출자 소유 여부:", ownership.isOwner ? "✅ 소유" : "❌ 미소유");
}

function logAgentInfo(agentInfo) {
    console.log("\n🎨 Agent NFT 정보:");
    console.log("  - 라운드 ID:", agentInfo.roundId.toString());
    console.log("  - 타입 해시:", agentInfo.typeHash);
}

function logRoundInfo(roundInfo) {
    console.log("\n🎯 라운드 정보:");
    console.log("  - 시작 시간:", new Date(roundInfo.startedAt * 1000).toISOString());
    console.log("  - 종료 시간:", roundInfo.endedAt ? new Date(roundInfo.endedAt * 1000).toISOString() : "미종료");
}

function logSettleInfo(settleInfo) {
    console.log("\n💰 라운드 정산 정보:");
    console.log("  - 총 모금액:", ethers.formatEther(settleInfo.depositedAmount));
    console.log("  - 환불된 금액:", ethers.formatEther(settleInfo.refundedAmount));
}

function logAvailability(availability) {
    console.log("\n⏰ 환불 가능 시간:");
    console.log("  - 현재 시간:", availability.currentTime);
    console.log("  - 라운드 시작 시간:", availability.startedAt);
    console.log("  - 경과 시간:", availability.timeElapsed);
    console.log("  - 환불 가능 여부:", availability.isAvailable ? "✅ 가능" : "❌ 불가능");
}

function logRefundResult(result) {
    console.log("\n📋 refund 결과 요약:");
    console.log("  - 환불자:", result.refunder);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - Agent ID:", result.agentId);
    console.log("  - 환불 시간:", result.refundTime);
}

function logRefundProcess(mainAddress, wallet, roundId, agentId, roundStatus, ownership, agentInfo, roundInfo, settleInfo, availability, refundTx, receipt) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("🎯 Main 컨트랙트 refund를 시작합니다...");
    console.log("🎯 Main 컨트랙트 주소:", mainAddress);
    console.log("🎨 환불자 주소:", wallet.address);
    console.log("🎯 라운드 ID:", roundId);
    console.log("🎨 Agent ID:", agentId);
    console.log("📊 라운드 상태:", roundStatus);
    console.log("🎨 Agent 소유자:", ownership.owner);
    console.log("💰 총 모금액:", ethers.formatEther(settleInfo.depositedAmount));
    console.log("⏰ 환불 가능 여부:", availability.isAvailable ? "가능" : "불가능");
    console.log("✅ refund 완료! 트랜잭션 해시:", refundTx.hash);
    console.log("📦 블록 번호:", receipt.blockNumber);
}

// 모듈로 export
module.exports = { 
    refund,
    initializeContracts,
    getContractStatus,
    getRoundStatus,
    checkAgentOwnership,
    getAgentInfo,
    getRoundInfo,
    getRoundSettleInfo,
    checkRefundAvailability,
    executeRefund,
    formatRefundResult,
    logContractStatus,
    logRoundStatus,
    logAgentOwnership,
    logAgentInfo,
    logRoundInfo,
    logSettleInfo,
    logAvailability,
    logRefundResult,
    logRefundProcess
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