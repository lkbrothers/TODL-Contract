const fs = require('fs');
const path = require('path');
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
        console.error("");
        console.error("예시:");
        console.error("  node cli.js itemParts:mint");
        console.error("  node cli.js main:buyAgent 1 2 3 4 5");
        console.error("  node cli.js main:closeTicketRound");
        console.error("  node cli.js main:claim 1 5");
        console.error("  node cli.js main:refund 1 5");
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
                }, result.totalSupply, result.remainingMints
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

        } else {
            console.error("❌ 지원하지 않는 액션입니다:", action);
            console.error("지원하는 액션:");
            console.error("  itemParts:mint");
            console.error("  main:buyAgent <itemParts_ids...>");
            console.error("  main:closeTicketRound");
            console.error("  main:claim <round_id> <agent_id>");
            console.error("  main:refund <round_id> <agent_id>");
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