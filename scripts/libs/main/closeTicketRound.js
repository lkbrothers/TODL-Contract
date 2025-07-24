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

// 4. 라운드 정보 확인
async function getRoundInfo(main, roundId) {
    try {
        const roundInfo = await main.roundStatusManageInfo(roundId);
        return roundInfo;
    } catch (error) {
        throw new Error(`라운드 정보 확인 실패: ${error.message}`);
    }
}

// 7. 라운드 종료 가능 시간 확인
async function checkCloseTicketAvailability(main, roundId) {
    try {
        // Main.sol의 getRemainTimeCloseTicketRound 함수 호출
        const remainTime = await main.getRemainTimeCloseTicketRound();
        // 0xffffffff는 status가 맞지 않다는 뜻
        if (remainTime === 0xffffffffn) {
            return {
                remainTime: remainTime.toString(),
                isAvailable: false,
                reason: "Status is not Proceeding"
            };
        }
        
        // 0이면 호출 가능, 0이 아닌 값은 아직 시간이 덜 됨
        const isAvailable = remainTime === 0n;
        
        return {
            remainTime: remainTime.toString(),
            isAvailable: isAvailable,
            reason: isAvailable ? "Ready to close" : "Time not elapsed yet"
        };
    } catch (error) {
        throw new Error(`라운드 종료 가능 시간 확인 실패: ${error.message}`);
    }
}

// 8. closeTicketRound 실행
async function executeCloseTicketRound(main, wallet) {
    try {
        const closeTicketTx = await main.connect(wallet).closeTicketRound();
        const receipt = await closeTicketTx.wait();
        return { transaction: closeTicketTx, receipt };
    } catch (error) {
        throw new Error(`closeTicketRound 실행 실패: ${error.message}`);
    }
}

// 9. 결과 포맷팅
function formatCloseTicketRoundResult(wallet, closeTicketTx, receipt, roundId, contractStatus) {
    return {
        closer: wallet.address,
        transactionHash: closeTicketTx.hash,
        blockNumber: receipt.blockNumber,
        roundId: roundId.toString(),
        closeTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
}

// 메인 closeTicketRound 함수 (순수 함수)
async function closeTicketRound(mainAddress, customProvider = null, customWallet = null) {
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
        const roundId = contractStatus.roundId;
        
        if (!roundId || roundId.toString() === "0") {
            throw new Error("❌ 현재 진행 중인 라운드가 없습니다.");
        }
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        
        // 7. 라운드 종료 가능 시간 확인
        const availability = await checkCloseTicketAvailability(main, roundId);
        
        // 8. closeTicketRound 실행
        const { transaction: closeTicketTx, receipt } = await executeCloseTicketRound(main, wallet);

        // 9. 결과 포맷팅
        const result = formatCloseTicketRoundResult(wallet, closeTicketTx, receipt, roundId, contractStatus);

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

function logAdminStatus(isAdmin) {
    console.log("\n👑 Admin 권한:");
    console.log("  - Admin 여부:", isAdmin ? "✅ Admin" : "❌ 일반 사용자");
}

function logAgentOwnership(agentBalance) {
    console.log("\n🎨 Agent NFT 보유량:");
    console.log("  - 현재 라운드 보유량:", agentBalance.toString());
}

function logAvailability(availability) {
    console.log("\n⏰ 라운드 종료 가능 시간:");
    console.log("  - 현재 시간:", availability.currentTime);
    console.log("  - 라운드 시작 시간:", availability.startedAt);
    console.log("  - 종료 가능 시간:", availability.availAt);
    console.log("  - 종료 가능 여부:", availability.isAvailable ? "✅ 가능" : "❌ 불가능");
}

function logCloseTicketRoundResult(result) {
    console.log("\n📋 closeTicketRound 결과 요약:");
    console.log("  - 종료자:", result.closer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - 종료 시간:", result.closeTime);
}

function logCloseTicketRoundProcess(mainAddress, wallet, roundId, roundStatus, isAdmin, agentBalance, availability, closeTicketTx) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("🎯 Main 컨트랙트 closeTicketRound를 시작합니다...");
    console.log("🎯 Main 컨트랙트 주소:", mainAddress);
    console.log("🎨 종료자 주소:", wallet.address);
    console.log("🎯 라운드 ID:", roundId);
    console.log("📊 라운드 상태:", roundStatus);
    console.log("👑 Admin 여부:", isAdmin ? "Admin" : "일반 사용자");
    console.log("🎨 Agent 보유량:", agentBalance.toString());
    console.log("⏰ 종료 가능 여부:", availability.isAvailable ? "가능" : "불가능");
    console.log("✅ closeTicketRound 완료! 트랜잭션 해시:", closeTicketTx.hash);
    console.log("📦 블록 번호:", closeTicketTx.receipt.blockNumber);
}

// 모듈로 export
module.exports = { 
    closeTicketRound,
    initializeContracts,
    getContractStatus,
    getRoundStatus,
    getRoundInfo,
    checkCloseTicketAvailability,
    executeCloseTicketRound,
    formatCloseTicketRoundResult,
    logContractStatus,
    logRoundStatus,
    logAdminStatus,
    logAgentOwnership,
    logAvailability,
    logCloseTicketRoundResult,
    logCloseTicketRoundProcess
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error("❌ 사용법: node closeTicketRound.js <main_contract_address>");
        process.exit(1);
    }

    const mainAddress = args[0];

    closeTicketRound(mainAddress)
        .then((result) => {
            console.log("\n🎉 closeTicketRound 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ closeTicketRound 실패:", error.message);
            process.exit(1);
        });
} 