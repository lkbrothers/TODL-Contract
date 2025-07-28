/**
 * @file closeTicketRound.js
 * @notice Main 컨트랙트 closeTicketRound 관련 Library
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
 * @notice 특정 라운드의 상태를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 상태 (0: NotStarted, 1: Proceeding, 2: Drawing, 3: Claiming, 4: Refunding, 5: Ended)
 */
async function getRoundStatus(main, roundId) {
    try {
        const status = await main.getRoundStatus(roundId);
        return status;
    } catch (error) {
        throw new Error(`라운드 상태 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 라운드의 상세 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 상세 정보
 */
async function getRoundInfo(main, roundId) {
    try {
        const roundInfo = await main.roundStatusManageInfo(roundId);
        return roundInfo;
    } catch (error) {
        throw new Error(`라운드 정보 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 라운드 종료 가능 여부를 확인한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 종료 가능 여부 (remainTime, isAvailable, reason)
 */
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

/**
 * @notice closeTicketRound 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} wallet 종료자 지갑
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executeCloseTicketRound(main, wallet) {
    try {
        const closeTicketTx = await main.connect(wallet).closeTicketRound();
        const receipt = await closeTicketTx.wait();
        return { transaction: closeTicketTx, receipt };
    } catch (error) {
        throw new Error(`closeTicketRound 실행 실패: ${error.message}`);
    }
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
        
        // 3. 라운드번호 확인
        const roundId = await getRoundId(main);
        
        if (!roundId || roundId.toString() === "0") {
            throw new Error("❌ 현재 진행 중인 라운드가 없습니다.");
        }
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        if(roundStatus != 1n) {
            throw new Error("❌ 현재 라운드상태가 \"Proceeding\"이 아닙니다.");
        }
        
        // 7. 라운드 종료 가능 시간 확인
        const availability = await checkCloseTicketAvailability(main, roundId);
        
        // 종료 가능 여부 확인
        // if (!availability.isAvailable) {
        //     console.log("❌ 라운드 종료 불가능:", availability.reason);
        //     throw new Error(`❌ 라운드 종료가 불가능합니다. 사유: ${availability.reason}`);
        // }
        
        // 8. closeTicketRound 실행
        const { transaction: closeTicketTx, receipt } = await executeCloseTicketRound(main, wallet);

        // 9. 결과 포맷팅
        const result = {
            closer: wallet.address,
            transactionHash: closeTicketTx.hash,
            blockNumber: receipt.blockNumber,
            roundId: roundId.toString()
        };

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
/**
 * @notice closeTicketRound 결과를 출력한다.
 * @param {*} result closeTicketRound 결과물
 */
function logResult(result) {
    console.log("\n📋 CloseTicketRound Reports:");
    console.log("  - 종료자:", result.closer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 라운드 ID:", result.roundId);
}

// 모듈로 export
module.exports = { 
    closeTicketRound,
    logResult
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