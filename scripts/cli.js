const fs = require('fs');
const path = require('path');
const ethers = require('ethers')
require('dotenv').config();

// 모듈 import
const { 
    mintItemParts, 
    logContractStatus, 
    logMintedTokens, 
    logMintingResult, 
    logMintingProcess 
} = require('./libs/itemParts/mint');

const { 
    buyAgent, 
    logContractStatus: logMainContractStatus, 
    logRoundStatus, 
    logOwnershipChecks, 
    logBuyAgentResult, 
    logBuyAgentProcess 
} = require('./libs/main/buyAgent');

const { 
    closeTicketRound, 
    logContractStatus: logMainContractStatus2, 
    logRoundStatus: logRoundStatus2, 
    logAdminStatus, 
    logAgentOwnership, 
    logAvailability, 
    logCloseTicketRoundResult, 
    logCloseTicketRoundProcess 
} = require('./libs/main/closeTicketRound');

const { 
    claim, 
    logContractStatus: logMainContractStatus3, 
    logRoundStatus: logRoundStatus3, 
    logAgentOwnership: logAgentOwnership2, 
    logAgentInfo, 
    logWinnerInfo, 
    logSettleInfo, 
    logClaimResult, 
    logClaimProcess 
} = require('./libs/main/claim');

const { 
    refund, 
    logContractStatus: logMainContractStatus4, 
    logRoundStatus: logRoundStatus4, 
    logAgentOwnership: logAgentOwnership3, 
    logAgentInfo: logAgentInfo2, 
    logRoundInfo, 
    logSettleInfo: logSettleInfo2, 
    logAvailability: logAvailability2, 
    logRefundResult, 
    logRefundProcess 
} = require('./libs/main/refund');

const { startRound } = require('./libs/main/startRound');
const { settleRound } = require('./libs/main/settleRound');

const { 
    faucet, 
    logContractStatus: logSttContractStatus, 
    logTransferResult, 
    logTransferProcess 
} = require('./libs/stt/faucet');

const { 
    readMain, 
    logContractInfo, 
    logRoundStatusInfo, 
    logSttBalance, 
    logReadMainResult 
} = require('./libs/main/readMain');

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error("❌ 사용법: node cli.js <action> [arguments...]");
        console.error("지원하는 액션:");
        console.error("  itemParts:mint");
        console.error("  main:buyAgent <itemParts_ids...>");
        console.error("  main:closeTicketRound");
        console.error("  main:claim <round_id> <agent_id>");
        console.error("  main:refund <round_id> <agent_id>");
        console.error("  main:startRound");
        console.error("  main:settleRound <round_id> <randSeed>");
        console.error("  main:roundInfo");
        console.error("  stt:faucet <to_address> <amount_in_ether>");
        console.error("예시:");
        console.error("  node cli.js itemParts:mint");
        console.error("  node cli.js main:buyAgent 1 2 3 4 5");
        console.error("  node cli.js main:closeTicketRound");
        console.error("  node cli.js main:claim 1 5");
        console.error("  node cli.js main:refund 1 5");
        console.error("  node cli.js main:startRound");
        console.error("  node cli.js main:settleRound 1 1234567890");
        process.exit(1);
    }

    const action = args[0];
    const actionArgs = args.slice(1); // action에 종속적인 argument들이 있을 경우 필요

    try {
        // deployment-info.json 파일 읽기
        const deploymentInfoPath = path.join(__dirname, 'output', 'deployment-info.json');
        
        if (!fs.existsSync(deploymentInfoPath)) {
            console.error("❌ deployment-info.json 파일을 찾을 수 없습니다.");
            console.error("먼저 deployContract.js를 실행하여 컨트랙트를 배포해주세요.");
            process.exit(1);
        }

        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
        console.log("📋 컨트랙트 주소 정보를 읽었습니다.");

        // 액션에 따른 처리
        if (action === 'itemParts:mint') {
            const itemPartsAddress = deploymentInfo.contracts.itemParts;

            if (!itemPartsAddress) {
                console.error("❌ deployment-info.json에서 itemParts 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            console.log("🎯 ItemParts 컨트랙트 주소:", itemPartsAddress);

            const result = await mintItemParts(itemPartsAddress);
            
            // 결과 로깅
            logContractStatus(result.contractStatus);
            logMintingProcess(itemPartsAddress, {
                    address: result.minter, 
                    provider: { 
                        connection: { 
                            url: process.env.PROVIDER_URL || "http://localhost:8545" 
                        } 
                    } 
                }, result.remainingMints, { 
                    hash: result.transactionHash 
                }, result.blockNumber, result.totalSupply, result.remainingMints
            );
            logMintedTokens(result.mintedTokens);
            logMintingResult(result);
            
            console.log("✅ itemParts:mint 액션이 완료되었습니다.");

        } else if (action === 'main:buyAgent') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            if (actionArgs.length !== 5) {
                console.error("❌ ItemParts ID는 정확히 5개여야 합니다.");
                console.error("사용법: node cli.js main:buyAgent <id1> <id2> <id3> <id4> <id5>");
                process.exit(1);
            }

            const itemPartsIds = actionArgs.map(id => parseInt(id));

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);
            console.log("🎯 사용할 ItemParts ID:", itemPartsIds.join(", "));

            const result = await buyAgent(mainAddress, itemPartsIds);
            
            // 결과 로깅
            logMainContractStatus(result.contractStatus);
            logBuyAgentResult(result);
            
            console.log("✅ main:buyAgent 액션이 완료되었습니다.");

        } else if (action === 'main:closeTicketRound') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);

            const result = await closeTicketRound(mainAddress);
            
            // 결과 로깅
            logMainContractStatus2(result.contractStatus);
            logCloseTicketRoundResult(result);
            
            console.log("✅ main:closeTicketRound 액션이 완료되었습니다.");

        } else if (action === 'main:claim') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            if (actionArgs.length !== 2) {
                console.error("❌ claim은 라운드 ID와 Agent ID가 필요합니다.");
                console.error("사용법: node cli.js main:claim <round_id> <agent_id>");
                process.exit(1);
            }

            const roundId = parseInt(actionArgs[0]);
            const agentId = parseInt(actionArgs[1]);

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);
            console.log("🎯 라운드 ID:", roundId);
            console.log("🎨 Agent ID:", agentId);

            const result = await claim(mainAddress, roundId, agentId);
            
            // 결과 로깅
            logMainContractStatus3(result.contractStatus);
            logClaimResult(result);
            
            console.log("✅ main:claim 액션이 완료되었습니다.");

        } else if (action === 'main:refund') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            if (actionArgs.length !== 2) {
                console.error("❌ refund는 라운드 ID와 Agent ID가 필요합니다.");
                console.error("사용법: node cli.js main:refund <round_id> <agent_id>");
                process.exit(1);
            }

            const roundId = parseInt(actionArgs[0]);
            const agentId = parseInt(actionArgs[1]);

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);
            console.log("🎯 라운드 ID:", roundId);
            console.log("🎨 Agent ID:", agentId);

            const result = await refund(mainAddress, roundId, agentId);
            
            // 결과 로깅
            logMainContractStatus4(result.contractStatus);
            logRefundResult(result);
            
            console.log("✅ main:refund 액션이 완료되었습니다.");

        } else if (action === 'main:startRound') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);

            const result = await startRound(mainAddress);
            
            // 결과 출력
            console.log("✅ startRound 완료:");
            console.log("  - 라운드 ID:", result.roundId);
            console.log("  - 랜덤 시드:", result.randSeed);
            console.log("  - 라운드 상태:", result.roundStatus);
            console.log("  - 트랜잭션 해시:", result.transaction.hash);
            
            console.log("✅ main:startRound 액션이 완료되었습니다.");

        } else if (action === 'main:settleRound') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            if (actionArgs.length !== 2) {
                console.error("❌ settleRound는 라운드 ID와 startRound때 생성한 랜덤시드가 필요합니다.");
                console.error("사용법: node cli.js main:settleRound <round_id> <randomSeed>");
                process.exit(1);
            }

            const roundId = parseInt(actionArgs[0]);
            const randSeed = actionArgs[1];

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);
            console.log("🎯 라운드 ID:", roundId);
            console.log("🎯 랜덤시드", randSeed);


            const result = await settleRound(mainAddress, roundId, randSeed);
            
            // 결과 출력
            console.log("✅ settleRound 완료:");
            console.log("  - 라운드 ID:", result.roundId);
            console.log("  - 랜덤 시드:", result.randSeed);
            console.log("  - 이전 상태:", result.previousStatus);
            console.log("  - 새로운 상태:", result.newStatus);
            console.log("  - 트랜잭션 해시:", result.transaction.hash);
            console.log("  - 당첨 정보:");
            console.log("    - 당첨 해시:", result.winnerInfo.winningHash);
            console.log("    - 당첨자 수:", result.winnerInfo.winnerCount.toString());
            console.log("  - 정산 정보:");
            console.log("    - 총 입금액:", result.settleInfo.depositedAmount.toString());
            console.log("    - 총 상금:", result.settleInfo.totalPrizePayout.toString());
            console.log("    - 당첨자별 상금:", result.settleInfo.prizePerWinner.toString());
            console.log("    - 기부금:", result.settleInfo.donateAmount.toString());
            console.log("    - 투자금:", result.settleInfo.corporateAmount.toString());
            console.log("    - 운영비:", result.settleInfo.operationAmount.toString());
            console.log("    - 스테이킹:", result.settleInfo.stakedAmount.toString());
            
            console.log("✅ main:settleRound 액션이 완료되었습니다.");

        } else if (action === 'main:roundInfo') {
            const mainAddress = deploymentInfo.contracts.main;

            if (!mainAddress) {
                console.error("❌ deployment-info.json에서 main 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            console.log("🎯 Main 컨트랙트 주소:", mainAddress);

            const result = await readMain(mainAddress);
            
            // 결과 로깅
            logContractInfo(result.contractInfo);
            logRoundStatusInfo(result.roundStatusInfo);
            logSttBalance(result.sttBalance, result.walletAddress);
            logReadMainResult(result);
            
            console.log("✅ main:roundInfo 액션이 완료되었습니다.");

        } else if (action === 'stt:faucet') {
            const sttAddress = deploymentInfo.contracts.sttToken;

            if (!sttAddress) {
                console.error("❌ deployment-info.json에서 sttToken 주소를 찾을 수 없습니다.");
                process.exit(1);
            }

            if (actionArgs.length !== 2) {
                console.error("❌ faucet은 수신자 주소와 전송량이 필요합니다.");
                console.error("사용법: node cli.js stt:faucet <to_address> <amount_in_ether>");
                process.exit(1);
            }

            const to = actionArgs[0];
            const amount = ethers.parseEther(actionArgs[1]);

            console.log("🎯 STT 컨트랙트 주소:", sttAddress);
            console.log("🎯 수신자 주소:", to);
            console.log("💰 전송량:", actionArgs[1], "STT");

            const result = await faucet(sttAddress, to, amount);
            
            // 결과 로깅
            logSttContractStatus(result.contractStatus);
            logTransferResult(result);
            
            console.log("✅ stt:faucet 액션이 완료되었습니다.");

        } else {
            console.error("❌ 지원하지 않는 액션입니다:", action);
            console.error("지원하는 액션:");
            console.error("  itemParts:mint");
            console.error("  main:buyAgent <itemParts_ids...>");
            console.error("  main:closeTicketRound");
            console.error("  main:claim <round_id> <agent_id>");
            console.error("  main:refund <round_id> <agent_id>");
            console.error("  main:startRound");
            console.error("  main:settleRound <round_id>");
            console.error("  main:roundInfo");
            console.error("  stt:faucet <to_address> <amount_in_ether>");
            process.exit(1);
        }

    } catch (error) {
        console.error("❌ CLI 실행 중 오류가 발생했습니다:", error);
        process.exit(1);
    }
}

// 스크립트 실행
main()
    .then(() => {
        console.log("\n🎯 CLI 실행 완료");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ CLI 실행 실패:", error);
        process.exit(1);
    }); 