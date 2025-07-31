/**
 * @file claim.js
 * @notice Main 컨트랙트 claim 관련 Library
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
 * @notice 라운드의 당첨 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 당첨 정보 (winningHash, winnerCount)
 */
async function getRoundWinnerInfo(main, roundId) {
    try {
        const winnerInfo = await main.roundWinnerManageInfo(roundId);
        return winnerInfo;
    } catch (error) {
        throw new Error(`라운드 당첨 정보 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 라운드의 정산 정보를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} roundId 확인할 라운드 ID
 * @returns 라운드 정산 정보 (depositedAmount, totalPrizePayout, prizePerWinner, claimedAmount)
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
 * @notice claim 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} wallet 수령자 지갑
 * @param {*} roundId 라운드 ID
 * @param {*} agentId Agent ID
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executeClaim(main, wallet, roundId, agentId) {
    try {
        const claimTx = await main.connect(wallet).claim(roundId, agentId, {
            gasLimit: 500000
        });
        const receipt = await claimTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${claimTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        return { transaction: claimTx, receipt };
    } catch (error) {
        throw new Error(`claim 실행 실패: ${error.message}`);
    }
}

/**
 * @notice claim 결과를 포맷팅한다.
 * @param {*} wallet 수령자 지갑
 * @param {*} claimTx claim 트랜잭션
 * @param {*} receipt 트랜잭션 영수증
 * @param {*} roundId 라운드 ID
 * @param {*} agentId Agent ID
 * @param {*} contractStatus 컨트랙트 상태
 * @returns 포맷팅된 claim 결과
 */
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
            
            provider = new ethers.JsonRpcProvider(providerUrl);
            wallet = new ethers.Wallet(privateKey, provider);
        }

        // 2. 컨트랙트 초기화
        const main = await initializeContracts(mainAddress, provider);
        
        // 3. 라운드번호 확인
        const roundId = await getRoundId(main);
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        if(roundStatus != 3n) {
            throw new Error("❌ 현재 라운드상태가 \"Claiming\"이 아닙니다.");
        }
        
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
        
        // 7. 라운드 당첨 정보 확인
        const winnerInfo = await getRoundWinnerInfo(main, roundId);
        
        // 8. 라운드 정산 정보 확인
        const settleInfo = await getRoundSettleInfo(main, roundId);
        
        // 9. claim 실행
        const { transaction: claimTx, receipt } = await executeClaim(main, wallet, roundId, agentId);

        // 10. 결과 포맷팅
        const result = {
            claimer: wallet.address,
            transactionHash: claimTx.hash,
            blockNumber: receipt.blockNumber,
            roundId: roundId.toString(),
            agentId: agentId.toString(),
            agentType: agentInfo.typeHash.toString(),
            prizeAmount: settleInfo.prizePerWinner.toString(),
            totalWinners: winnerInfo.winnerCount.toString(),
            claimTime: new Date().toISOString()
        };

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
/**
 * @notice claim 결과를 출력한다.
 * @param {*} result claim 결과물
 */
function logResult(result) {
    console.log("\n📋 Claim Reports:");
    console.log("  - 수령자:", result.claimer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - Agent ID:", result.agentId);
    console.log("  - Agent Type:", result.agentType);
    console.log("  - 받을 상금:", result.prizeAmount, "STT");
    console.log("  - 총 당첨자 수:", result.totalWinners);
    console.log("  - 수령 시간:", result.claimTime);
}

// 모듈로 export
module.exports = { 
    claim,
    logResult
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