const { Contract, JsonRpcProvider, Wallet } = require("ethers");
require('dotenv').config();

// 1. Provider 및 Contract 초기화
async function initializeContracts(itemPartsAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json").abi;
        const itemParts = new Contract(itemPartsAddress, abi, provider);
        return itemParts;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

// 2. 컨트랙트 상태 확인
async function getContractStatus(itemParts) {
    const status = {};
    
    try {
        status.totalSupply = await itemParts.totalSupply();
    } catch (error) {
        status.totalSupply = null;
    }
    
    try {
        status.mintAtTime = await itemParts.mintAtTime();
    } catch (error) {
        status.mintAtTime = null;
    }
    
    try {
        status.maxMintsPerDay = await itemParts.maxMintsPerDay();
    } catch (error) {
        status.maxMintsPerDay = null;
    }
    
    return status;
}

// 3. 민팅 전 상태 확인
async function checkMintingStatus(itemParts, walletAddress) {
    try {
        const remainingMints = await itemParts.getRemainingMintsToday(walletAddress);
        return remainingMints;
    } catch (error) {
        throw new Error(`민팅 상태 확인 실패: ${error.message}`);
    }
}

// 4. 민팅 실행
async function executeMinting(itemParts, wallet) {
    try {
        const mintTx = await itemParts.connect(wallet).mint();
        const receipt = await mintTx.wait();
        return { transaction: mintTx, receipt };
    } catch (error) {
        throw new Error(`민팅 실행 실패: ${error.message}`);
    }
}

// 5. 민팅된 토큰 정보 수집
async function getMintedTokensInfo(itemParts, totalSupplyAfter, mintAtTimeValue) {
    const mintedTokens = [];
    const mintAtTimeNum = Number(mintAtTimeValue);
    const totalSupplyNum = Number(totalSupplyAfter);
    
    for (let i = 1; i <= mintAtTimeNum; i++) {
        const tokenId = totalSupplyNum - mintAtTimeNum + i;
        try {
            const owner = await itemParts.ownerOf(tokenId);
            const tokenInfo = await itemParts.tokenInfo(tokenId);
            
            mintedTokens.push({
                tokenId: tokenId.toString(),
                owner: owner,
                typeName: tokenInfo.typeName,
                partsIndex: tokenInfo.partsIndex.toString(),
                originsIndex: tokenInfo.originsIndex.toString(),
                setNumsIndex: tokenInfo.setNumsIndex.toString()
            });
        } catch (error) {
            // 토큰 정보를 가져올 수 없는 경우 빈 객체로 처리
            mintedTokens.push({
                tokenId: tokenId.toString(),
                owner: null,
                typeName: null,
                partsIndex: null,
                originsIndex: null,
                setNumsIndex: null,
                error: error.message
            });
        }
    }
    
    return mintedTokens;
}

// 6. 결과 포맷팅
function formatMintingResult(wallet, mintTx, receipt, mintedTokens, totalSupplyAfter, remainingAfter, contractStatus) {
    return {
        minter: wallet.address,
        transactionHash: mintTx.hash,
        blockNumber: receipt.blockNumber,
        mintedTokens: mintedTokens,
        totalSupply: totalSupplyAfter.toString(),
        remainingMints: remainingAfter.toString(),
        mintTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
}

// 메인 민팅 함수 (순수 함수)
async function mintItemParts(itemPartsAddress, customProvider = null, customWallet = null) {
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
        const itemParts = await initializeContracts(itemPartsAddress, provider);
        
        // 3. 컨트랙트 상태 확인
        const contractStatus = await getContractStatus(itemParts);
        
        // 4. 민팅 전 상태 확인
        const remainingBefore = await checkMintingStatus(itemParts, wallet.address);

        // 5. 민팅 실행
        const { transaction: mintTx, receipt } = await executeMinting(itemParts, wallet);

        // 6. 민팅 후 상태 확인
        const totalSupplyAfter = await itemParts.totalSupply();
        const remainingAfter = await checkMintingStatus(itemParts, wallet.address);

        // 7. 민팅된 토큰 정보 수집
        const mintedTokens = await getMintedTokensInfo(itemParts, totalSupplyAfter, contractStatus.mintAtTime);

        // 8. 결과 포맷팅
        const result = formatMintingResult(wallet, mintTx, receipt, mintedTokens, totalSupplyAfter, remainingAfter, contractStatus);

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
function logContractStatus(status) {
    console.log("\n📊 현재 컨트랙트 상태:");
    if (status.totalSupply !== null) {
        console.log("  - 총 발행량:", status.totalSupply.toString());
    } else {
        console.log("  - 총 발행량: 확인 불가");
    }
    
    if (status.mintAtTime !== null) {
        console.log("  - mintAtTime:", status.mintAtTime.toString());
    } else {
        console.log("  - mintAtTime: 확인 불가");
    }
    
    if (status.maxMintsPerDay !== null) {
        console.log("  - maxMintsPerDay:", status.maxMintsPerDay.toString());
    } else {
        console.log("  - maxMintsPerDay: 확인 불가");
    }
}

function logMintedTokens(mintedTokens) {
    console.log("\n🎁 민팅된 NFT 정보:");
    mintedTokens.forEach((token, index) => {
        console.log(`  ${index + 1}. 토큰 ID: ${token.tokenId}`);
        if (token.owner) {
            console.log(`     소유자: ${token.owner}`);
            console.log(`     타입: ${token.typeName}`);
            console.log(`     부위 인덱스: ${token.partsIndex}`);
            console.log(`     기원 인덱스: ${token.originsIndex}`);
            console.log(`     세트 번호 인덱스: ${token.setNumsIndex}`);
        } else {
            console.log(`     ⚠️ 토큰 정보를 가져올 수 없습니다: ${token.error}`);
        }
        console.log("");
    });
}

function logMintingResult(result) {
    console.log("\n📋 민팅 결과 요약:");
    console.log("  - 민터:", result.minter);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 민팅된 NFT 개수:", result.mintedTokens.length);
    console.log("  - 민팅 시간:", result.mintTime);
}

function logMintingProcess(itemPartsAddress, wallet, remainingBefore, mintTx, blockNumber, totalSupplyAfter, remainingAfter) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("🎨 ItemParts NFT 민팅을 시작합니다...");
    console.log("🎯 ItemParts 컨트랙트 주소:", itemPartsAddress);
    console.log("🎨 민터 주소:", wallet.address);
    console.log("📈 민팅 전 남은 횟수:", remainingBefore.toString());
    console.log("✅ 민팅 완료! 트랜잭션 해시:", mintTx.hash);
    console.log("📦 블록 번호:", blockNumber);
    console.log("\n📊 민팅 후 상태:");
    console.log("  - 총 발행량:", totalSupplyAfter.toString());
    console.log("  - 남은 민팅 횟수:", remainingAfter ? remainingAfter.toString() : "확인 불가");
}

// 모듈로 export
module.exports = { 
    mintItemParts,
    initializeContracts,
    getContractStatus,
    checkMintingStatus,
    executeMinting,
    getMintedTokensInfo,
    formatMintingResult,
    logContractStatus,
    logMintedTokens,
    logMintingResult,
    logMintingProcess
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error("❌ 사용법: node mint.js <itemParts_contract_address>");
        process.exit(1);
    }

    const itemPartsAddress = args[0];

    mintItemParts(itemPartsAddress)
        .then((result) => {
            // CLI에서만 로깅 출력
            logContractStatus(result.contractStatus);
            logMintingProcess(
                itemPartsAddress, 
                { address: result.minter, provider: { connection: { url: process.env.PROVIDER_URL || "http://localhost:8545" } } }, 
                result.remainingMints, 
                { hash: result.transactionHash }, 
                { blockNumber: result.blockNumber}, 
                result.totalSupply, 
                result.remainingMints);
            logMintedTokens(result.mintedTokens);
            logMintingResult(result);
            console.log("\n🎯 민팅 스크립트 실행 완료");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ 민팅 스크립트 실행 실패:", error);
            process.exit(1);
        });
} 