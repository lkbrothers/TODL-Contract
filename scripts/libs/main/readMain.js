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

// 2. 컨트랙트 기본 정보 확인
async function getContractInfo(main) {
    try {
        const info = {};
        
        // 기본 정보
        info.roundId = await main.roundId();
        info.donateAddr = await main.donateAddr();
        info.corporateAddr = await main.corporateAddr();
        info.operationAddr = await main.operationAddr();
        
        // 관리되는 컨트랙트들
        info.managedContracts = [];
        for (let i = 0; i < 8; i++) { // Types.ContractTags.Max = 8
            try {
                const contractAddr = await main.managedContracts(i);
                info.managedContracts.push(contractAddr);
            } catch (error) {
                info.managedContracts.push(null);
            }
        }
        
        return info;
    } catch (error) {
        throw new Error(`컨트랙트 정보 조회 실패: ${error.message}`);
    }
}

// 3. 라운드 상태 정보 확인
async function getRoundStatusInfo(main, roundId) {
    try {
        const status = {};
        
        // 라운드 상태
        status.roundStatus = await main.getRoundStatus(roundId);
        
        // 라운드 관리 정보
        const roundInfo = await main.roundStatusManageInfo(roundId);
        status.startedAt = roundInfo.startedAt;
        status.closeTicketAt = roundInfo.closeTicketAt;
        status.settledAt = roundInfo.settledAt;
        status.refundedAt = roundInfo.refundedAt;
        status.endedAt = roundInfo.endedAt;
        
        // 라운드 당첨 정보
        const winnerInfo = await main.roundWinnerManageInfo(roundId);
        status.winningHash = winnerInfo.winningHash;
        status.winnerCount = winnerInfo.winnerCount;
        
        // 라운드 정산 정보
        const settleInfo = await main.roundSettleManageInfo(roundId);
        status.depositedAmount = settleInfo.depositedAmount;
        status.claimedAmount = settleInfo.claimedAmount;
        status.donateAmount = settleInfo.donateAmount;
        status.corporateAmount = settleInfo.corporateAmount;
        status.operationAmount = settleInfo.operationAmount;
        status.stakedAmount = settleInfo.stakedAmount;
        
        return status;
    } catch (error) {
        throw new Error(`라운드 상태 정보 조회 실패: ${error.message}`);
    }
}

// 4. STT 잔액 확인
async function getSttBalance(main, address) {
    try {
        const balance = await main.getCoinBalance(address);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

// 5. 결과 포맷팅
function formatReadMainResult(contractInfo, roundStatusInfo, sttBalance, walletAddress) {
    return {
        contractInfo: contractInfo,
        roundStatusInfo: roundStatusInfo,
        sttBalance: sttBalance.toString(),
        walletAddress: walletAddress,
        readTime: new Date().toISOString()
    };
}

// 메인 readMain 함수 (순수 함수)
async function readMain(mainAddress, customProvider = null, customWallet = null) {
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
        
        // 3. 컨트랙트 기본 정보 확인
        const contractInfo = await getContractInfo(main);
        
        // 4. 현재 라운드 상태 정보 확인
        const roundStatusInfo = await getRoundStatusInfo(main, contractInfo.roundId);
        
        // 5. STT 잔액 확인
        const sttBalance = await getSttBalance(main, wallet.address);

        // 6. 결과 포맷팅
        const result = formatReadMainResult(contractInfo, roundStatusInfo, sttBalance, wallet.address);

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
function logContractInfo(info) {
    console.log("\n📊 Main 컨트랙트 정보:");
    console.log("  - 현재 라운드 ID:", info.roundId.toString());
    console.log("  - 기부 주소:", info.donateAddr);
    console.log("  - 영리법인 주소:", info.corporateAddr);
    console.log("  - 운영비 주소:", info.operationAddr);
    
    console.log("\n🔗 관리되는 컨트랙트들:");
    const contractNames = ["Main", "ItemParts", "Agent", "Rng", "RewardPool", "StakePool", "Reserv", "Stt"];
    info.managedContracts.forEach((addr, index) => {
        if (addr && addr !== "0x0000000000000000000000000000000000000000") {
            console.log(`  - ${contractNames[index]}: ${addr}`);
        } else {
            console.log(`  - ${contractNames[index]}: 설정되지 않음`);
        }
    });
}

function logRoundStatusInfo(status) {
    console.log("\n🎯 라운드 상태 정보:");
    const statusNames = ["NotStarted", "Proceeding", "Drawing", "Claiming", "Refunding", "Ended"];
    console.log("  - 라운드 상태:", statusNames[status.roundStatus] || "Unknown");
    
    console.log("\n⏰ 라운드 시간 정보:");
    console.log("  - 시작 시간:", status.startedAt ? new Date(Number(status.startedAt) * 1000).toISOString() : "미시작");
    console.log("  - 세일 종료 시간:", status.closeTicketAt ? new Date(Number(status.closeTicketAt) * 1000).toISOString() : "미종료");
    console.log("  - 정산 시간:", status.settledAt ? new Date(Number(status.settledAt) * 1000).toISOString() : "미정산");
    console.log("  - 환불 시간:", status.refundedAt ? new Date(Number(status.refundedAt) * 1000).toISOString() : "미환불");
    console.log("  - 종료 시간:", status.endedAt ? new Date(Number(status.endedAt) * 1000).toISOString() : "미종료");
    
    console.log("\n🏆 라운드 당첨 정보:");
    console.log("  - 당첨 해시:", status.winningHash);
    console.log("  - 당첨자 수:", status.winnerCount.toString());
    
    console.log("\n💰 라운드 정산 정보:");
    console.log("  - 총 입금액:", ethers.formatEther(status.depositedAmount), "STT");
    console.log("  - 총 수령액:", ethers.formatEther(status.claimedAmount), "STT");
    console.log("  - 기부금:", ethers.formatEther(status.donateAmount), "STT");
    console.log("  - 투자금:", ethers.formatEther(status.corporateAmount), "STT");
    console.log("  - 운영비:", ethers.formatEther(status.operationAmount), "STT");
    console.log("  - 스테이킹:", ethers.formatEther(status.stakedAmount), "STT");
}

function logSttBalance(balance, walletAddress) {
    console.log("\n💰 STT 잔액 정보:");
    console.log("  - 지갑 주소:", walletAddress);
    console.log("  - STT 잔액:", ethers.formatEther(balance), "STT");
}

function logReadMainResult(result) {
    console.log("\n📋 Main 컨트랙트 읽기 결과 요약:");
    console.log("  - 읽기 시간:", result.readTime);
    console.log("  - 현재 라운드 ID:", result.contractInfo.roundId.toString());
    console.log("  - 라운드 상태:", result.roundStatusInfo.roundStatus);
    console.log("  - STT 잔액:", ethers.formatEther(result.sttBalance), "STT");
}

// 모듈로 export
module.exports = { 
    readMain,
    initializeContracts,
    getContractInfo,
    getRoundStatusInfo,
    getSttBalance,
    formatReadMainResult,
    logContractInfo,
    logRoundStatusInfo,
    logSttBalance,
    logReadMainResult
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error("❌ 사용법: node readMain.js <main_contract_address>");
        process.exit(1);
    }

    const mainAddress = args[0];

    readMain(mainAddress)
        .then((result) => {
            console.log("\n🎉 Main 컨트랙트 읽기 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ Main 컨트랙트 읽기 실패:", error.message);
            process.exit(1);
        });
} 