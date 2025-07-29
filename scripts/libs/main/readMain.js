/**
 * @file readMain.js
 * @notice Main 컨트랙트 읽기 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, getBigInt, getAddress, AbiCoder } = require("ethers");
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

/**
 * @notice Main 컨트랙트의 기본 정보를 반환한다.
 * @dev 기본정보는 다음과 같다. (roundId, donateAddr, corporateAddr, operationAddr, managedContracts)
 * @param {*} main Main 컨트랙트 주소
 * @returns contractInfo (Main 컨트랙트의 기본 정보)
 */
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

/**
 * @notice 라운드의 상태 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 상태 정보 (roundStatus, startedAt, closeTicketAt, settledAt, refundedAt, endedAt, winningHash, winnerCount, depositedAmount, claimedAmount, donateAmount, corporateAmount, operationAmount, stakedAmount)
 */
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

/**
 * @notice 특정 주소의 STT 토큰 잔액을 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} address 확인할 주소
 * @returns STT 토큰 잔액
 */
async function getSttBalance(main, address) {
    try {
        const balance = await main.getCoinBalance(address);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * @notice readMain 결과를 포맷팅한다.
 * @param {*} contractInfo 컨트랙트 기본 정보
 * @param {*} roundStatusInfo 라운드 상태 정보
 * @param {*} sttBalance STT 잔액
 * @param {*} walletAddress 지갑 주소
 * @returns 포맷팅된 readMain 결과
 */
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

/**
 * @notice readMain 결과를 출력한다.
 * @param {*} result readMain 결과물
 */
function logResult(result) {
    console.log("\n📋 ReadMain Reports:");
    console.log("  - 읽기 시간:", result.readTime);
    console.log("  - 현재 라운드 ID:", result.contractInfo.roundId.toString());
    console.log("  - 라운드 상태:", result.roundStatusInfo.roundStatus);
    console.log("  - STT 잔액:", ethers.formatEther(result.sttBalance), "STT");
}

// 모듈로 export
module.exports = { 
    readMain,
    logResult
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