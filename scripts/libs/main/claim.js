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

// 6. 라운드 당첨 정보 확인
async function getRoundWinnerInfo(main, roundId) {
    try {
        const winnerInfo = await main.roundWinnerManageInfo(roundId);
        return winnerInfo;
    } catch (error) {
        throw new Error(`라운드 당첨 정보 확인 실패: ${error.message}`);
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

// 8. claim 실행
async function executeClaim(main, wallet, roundId, agentId) {
    try {
        const claimTx = await main.connect(wallet).claim(roundId, agentId);
        const receipt = await claimTx.wait();
        return { transaction: claimTx, receipt };
    } catch (error) {
        throw new Error(`claim 실행 실패: ${error.message}`);
    }
}

// 9. 결과 포맷팅
function formatClaimResult(wallet, claimTx, receipt, roundId, agentId, contractStatus) {
    return {
        claimer: wallet.address,
        transactionHash: claimTx.hash,
        blockNumber: receipt.blockNumber,
        roundId: roundId.toString(),
        agentId: agentId.toString(),
        claimTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
}

// 메인 claim 함수 (순수 함수)
async function claim(mainAddress, roundId, agentId, customProvider = null, customWallet = null) {
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
        
        // 7. 라운드 당첨 정보 확인
        const winnerInfo = await getRoundWinnerInfo(main, roundId);
        
        // 8. 라운드 정산 정보 확인
        const settleInfo = await getRoundSettleInfo(main, roundId);
        
        // 9. claim 실행
        const { transaction: claimTx, receipt } = await executeClaim(main, wallet, roundId, agentId);

        // 10. 결과 포맷팅
        const result = formatClaimResult(wallet, claimTx, receipt, roundId, agentId, contractStatus);

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

function logWinnerInfo(winnerInfo) {
    console.log("\n🏆 라운드 당첨 정보:");
    console.log("  - 당첨 해시:", winnerInfo.winningHash);
    console.log("  - 당첨자 수:", winnerInfo.winnerCount.toString());
}

function logSettleInfo(settleInfo) {
    console.log("\n💰 라운드 정산 정보:");
    console.log("  - 총 모금액:", ethers.formatEther(settleInfo.depositedAmount));
    console.log("  - 총 상금:", ethers.formatEther(settleInfo.totalPrizePayout));
    console.log("  - 당첨자별 상금:", ethers.formatEther(settleInfo.prizePerWinner));
    console.log("  - 수령된 상금:", ethers.formatEther(settleInfo.claimedAmount));
}

function logClaimResult(result) {
    console.log("\n📋 claim 결과 요약:");
    console.log("  - 수령자:", result.claimer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - Agent ID:", result.agentId);
    console.log("  - 수령 시간:", result.claimTime);
}

function logClaimProcess(mainAddress, wallet, roundId, agentId, roundStatus, ownership, agentInfo, winnerInfo, settleInfo, claimTx, receipt) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("🎯 Main 컨트랙트 claim을 시작합니다...");
    console.log("🎯 Main 컨트랙트 주소:", mainAddress);
    console.log("🎨 수령자 주소:", wallet.address);
    console.log("🎯 라운드 ID:", roundId);
    console.log("🎨 Agent ID:", agentId);
    console.log("📊 라운드 상태:", roundStatus);
    console.log("🎨 Agent 소유자:", ownership.owner);
    console.log("🏆 당첨 해시:", winnerInfo.winningHash);
    console.log("💰 당첨자별 상금:", ethers.formatEther(settleInfo.prizePerWinner));
    console.log("✅ claim 완료! 트랜잭션 해시:", claimTx.hash);
    console.log("📦 블록 번호:", receipt.blockNumber);
}

// 모듈로 export
module.exports = { 
    claim,
    initializeContracts,
    getContractStatus,
    getRoundStatus,
    checkAgentOwnership,
    getAgentInfo,
    getRoundWinnerInfo,
    getRoundSettleInfo,
    executeClaim,
    formatClaimResult,
    logContractStatus,
    logRoundStatus,
    logAgentOwnership,
    logAgentInfo,
    logWinnerInfo,
    logSettleInfo,
    logClaimResult,
    logClaimProcess
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error("❌ 사용법: node claim.js <main_contract_address> <round_id> <agent_id>");
        process.exit(1);
    }

    const mainAddress = args[0];
    const roundId = parseInt(args[1]);
    const agentId = parseInt(args[2]);

    claim(mainAddress, roundId, agentId)
        .then((result) => {
            console.log("\n🎉 claim 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ claim 실패:", error.message);
            process.exit(1);
        });
} 