/**
 * @file refund.js
 * @notice Main 컨트랙트 refund 관련 Library
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
 * @notice Main 컨트랙트의 주요정보를 반환한다.
 * @dev 주요정보는 다음과 같다. (roundId, donateAddr, corporateAddr, operationAddr)
 * @param {*} main Main 컨트랙트 주소
 * @returns status (Main 컨트랙트의 주요정보)
 */
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
 * @notice Agent NFT의 소유권을 확인한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} walletAddress 확인할 지갑 주소
 * @param {*} agentId 확인할 Agent ID
 * @returns 소유권 정보 (owner, isOwner, agentAddress)
 */
async function checkAgentOwnership(main, walletAddress, agentId) {
    try {
        const agentAddress = await main.managedContracts(2); // Agent는 2번 인덱스
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

/**
 * @notice Agent NFT의 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} agentId 확인할 Agent ID
 * @returns Agent 정보 (roundId, typeHash, agentAddress)
 */
async function getAgentInfo(main, agentId) {
    try {
        const agentAddress = await main.managedContracts(2); // Agent는 2번 인덱스
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
 * @notice 라운드의 정산 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 정산 정보 (depositedAmount, refundedAmount)
 */
async function getRoundSettleInfo(main, roundId) {
    try {
        const settleInfo = await main.roundSettleManageInfo(roundId);
        return settleInfo;
    } catch (error) {
        throw new Error(`라운드 정산 정보 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 환불 가능 여부를 확인한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 환불 가능 여부 (currentTime, startedAt, timeElapsed, isAvailable)
 */
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
        const refundTx = await main.connect(wallet).refund(roundId, agentId);
        const receipt = await refundTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${refundTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        return { transaction: refundTx, receipt };
    } catch (error) {
        throw new Error(`refund 실행 실패: ${error.message}`);
    }
}

/**
 * @notice refund 결과를 포맷팅한다.
 * @param {*} wallet 환불자 지갑
 * @param {*} refundTx refund 트랜잭션
 * @param {*} receipt 트랜잭션 영수증
 * @param {*} roundId 라운드 ID
 * @param {*} agentId Agent ID
 * @param {*} contractStatus 컨트랙트 상태
 * @returns 포맷팅된 refund 결과
 */
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