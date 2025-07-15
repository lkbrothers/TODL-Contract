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

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error("❌ 사용법: node cli.js <action> [arguments...]");
        console.error("지원하는 액션:");
        console.error("  itemParts:mint");
        console.error("");
        console.error("예시:");
        console.error("  node cli.js itemParts:mint");
        process.exit(1);
    }

    const action = args[0];
    const actionArgs = args.slice(1);

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
            logMintingProcess(itemPartsAddress, { address: result.minter, provider: { connection: { url: process.env.PROVIDER_URL || "http://localhost:8545" } } }, result.remainingMints, { hash: result.transactionHash }, result.totalSupply, result.remainingMints);
            logMintedTokens(result.mintedTokens);
            logMintingResult(result);
            
            console.log("✅ itemParts:mint 액션이 완료되었습니다.");

        } else {
            console.error("❌ 지원하지 않는 액션입니다:", action);
            console.error("지원하는 액션:");
            console.error("  itemParts:mint");
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