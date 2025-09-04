/**
 * @file mint.js
 * @notice ItemParts NFT minting 관련 Library
 * @author hlibbc
 */
const { ethers } = require("hardhat");
require('dotenv').config();

/**
 * @notice Provider 및 Contract 초기화
 * @param {*} itemPartsAddress ItemParts NFT 컨트랙트 주소
 * @param {*} provider 타겟 블록체인 SP URL
 * @returns itemParts Contract Object
 */
async function initializeContracts(itemPartsAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json").abi;
        const itemParts = new ethers.Contract(itemPartsAddress, abi, provider);
        return itemParts;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * @notice 사용자의 일일 남은 민팅량을 반환한다.
 * @param {*} itemParts ItemParts NFT 컨트랙트 주소
 * @param {*} walletAddress 사용자의 주소 (EOA)
 * @returns 사용자의 일일 남은 민팅량
 */
async function checkMintingStatus(itemParts, walletAddress) {
    try {
        const remainingMints = await itemParts.getRemainingMintsToday(walletAddress);
        return remainingMints;
    } catch (error) {
        throw new Error(`민팅 상태 확인 실패: ${error.message}`);
    }
}

/**
 * @notice ItemParts NFT mint를 수행한다.
 * @dev 한번에 mintAtTime만큼 민팅되며, 디폴트 mintAtTime 값은 5이다.
 * 각각 랜덤하게 민팅된다.
 * @param {*} itemParts ItemParts NFT 컨트랙트 주소
 * @param {*} wallet 민팅을 수행할 사용자의 주소 (EOA)
 * @returns 트랜잭션 정보 (txInfo, receipt, mintedTokens)
 */
async function executeMinting(itemParts, wallet) {
    try {
        const mintTx = await itemParts.connect(wallet).mint({
            gasLimit: 1500000 // 약 150만 gas limit 설정
        });
        const receipt = await mintTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${mintTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        // Minted 이벤트 파싱
        const mintedTokens = [];
        for (const log of receipt.logs) {
            try {
                // Minted 이벤트 시그니처:
                const eventSignature = "Minted(uint256,address,uint256,uint256,uint256)";
                const eventTopic = ethers.keccak256(ethers.toUtf8Bytes(eventSignature));
                
                if (log.topics[0] === eventTopic) {
                    // 이벤트 데이터 파싱
                    const tokenId = ethers.getBigInt(log.topics[1]); // indexed parameter
                    
                    // 32바이트 패딩된 주소에서 하위 20바이트 추출
                    const paddedAddress = log.topics[2];
                    const owner = "0x" + paddedAddress.slice(-40); // 하위 20바이트 (40자)
                    
                    mintedTokens.push({tokenId: tokenId.toString(), owner: owner});
                }
            } catch (error) {
                // 이벤트 파싱 실패 시 무시하고 계속 진행
                console.log("⚠️ 이벤트 파싱 실패:", error.message);
            }
        }
        
        return { transaction: mintTx, receipt, mintedTokens };
    } catch (error) {
        throw new Error(`민팅 실행 실패: ${error.message}`);
    }
}

/**
 * @notice 이벤트에서 파싱된 토큰 정보를 기반으로 추가 정보를 수집
 * @param {*} itemParts ItemParts NFT 컨트랙트
 * @param {*} parts 이벤트에서 파싱된 토큰 정보 배열
 * @returns minting된 토큰정보 배열 (tokenId, owner, typeName, partsIndex, originsIndex, setNumsIndex)
 */
async function getMintedTokensInfo(itemParts, parts) {
    const enrichedTokens = [];
    
    for (const idx of parts) {
        try {
            const tokenInfo = await itemParts.tokenInfo(idx.tokenId);
            
            enrichedTokens.push({
                tokenId: idx.tokenId,
                owner: idx.owner,
                typeName: tokenInfo.typeName,
                partsIndex: tokenInfo.partsIndex,
                originsIndex: tokenInfo.originsIndex,
                setNumsIndex: tokenInfo.setNumsIndex
            });
        } catch (error) {
            // 토큰 정보를 가져올 수 없는 경우 기본 정보만 사용
            enrichedTokens.push({
                tokenId: idx.tokenId,
                owner: idx.owner,
                typeName: null,
                partsIndex: null,
                originsIndex: null,
                setNumsIndex: null,
                error: error.message
            });
        }
    }
    return enrichedTokens;
}

// 메인 민팅 함수
/**
 * @notice ItemParts NFT 민팅을 수행한다.
 * @param {*} itemPartsAddress ItemParts NFT 컨트랙트
 * @param {*} customProvider provider 정보 (optional)
 * @param {*} customWallet wallet 정보 (optional)
 * @returns minting reports
 */
async function mintItemParts(itemPartsAddress, customProvider = null, customWallet = null) {
    try {
        // Provider 및 Wallet 설정
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

        // 컨트랙트 초기화
        const itemParts = await initializeContracts(itemPartsAddress, provider);
        
        // 민팅 실행
        const { transaction: mintTx, receipt, mintedTokens } = await executeMinting(itemParts, wallet);

        // 민팅 후 상태 확인
        const remainingAfter = await checkMintingStatus(itemParts, wallet.address);

        // 민팅된 토큰 정보 수집
        const enrichedTokens = await getMintedTokensInfo(itemParts, mintedTokens);

        // 결과 포맷팅 (minter, provider, txHash, blockNumber, enrichedTokens, remainMintAmount)
        const result = {
            minter: wallet.address,
            provider: provider,
            transactionHash: mintTx.hash,
            blockNumber: receipt.blockNumber,
            mintedTokens: enrichedTokens,
            remainingMints: remainingAfter.toString()
        };

        return result;

    } catch (error) {
        throw error;
    }
}

/**
 * @notice 민팅 결과를 출력한다.
 * @param {*} result mintItemParts 결과물
 */
function logResult(result) {
    console.log("\n📋 Minting Reports:");
    console.log("  - minter:", result.minter);
    console.log("  - transaction-hash:", result.transactionHash);
    console.log("  - blockNumber:", result.blockNumber);
    console.log("  - 민팅 수량:", result.mintedTokens.length);
    console.log("  - 남은 민트갯수:", result.remainingMints);

    logMintedTokens(result.mintedTokens);
}

/**
 * @notice bulk로 민팅된 itemParts NFT 정보를 출력한다.
 * @param {*} mintedTokens bulk로 민팅된 itemParts NFT 정보 (배열)
 */
function logMintedTokens(parts) {
    console.log("\n🎁 민팅된 NFT 정보:");
    parts.forEach((idx, index) => {
        console.log(`  ${index + 1}. 토큰 ID: ${idx.tokenId}`);
        if (idx.owner) {
            console.log(`     소유자: ${idx.owner}`);
            console.log(`     타입: ${idx.typeName}`);
            console.log(`     부위 인덱스: ${idx.partsIndex}`);
            console.log(`     기원 인덱스: ${idx.originsIndex}`);
            console.log(`     세트 번호 인덱스: ${idx.setNumsIndex}`);
        } else {
            console.log(`     ⚠️ 토큰 정보를 가져올 수 없습니다: ${idx.error}`);
        }
        console.log("");
    });
}

// 모듈로 export
module.exports = { 
    mintItemParts,
    logResult
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
            logResult(result)
            console.log("\n🎯 민팅 스크립트 실행 완료");
            process.exit(0);
        })
        .catch((error) => {
            console.error("❌ 민팅 스크립트 실행 실패:", error);
            process.exit(1);
        });
} 