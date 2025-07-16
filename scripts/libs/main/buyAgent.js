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

// 2. 컨트랙트 상태 확인
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

// 3. 라운드 상태 확인
async function getRoundStatus(main, roundId) {
    try {
        const status = await main.getRoundStatus(roundId);
        return status;
    } catch (error) {
        throw new Error(`라운드 상태 확인 실패: ${error.message}`);
    }
}

// 4. 사용자 STT 잔액 확인
async function getCoinBalance(main, walletAddress) {
    try {
        const balance = await main.getCoinBalance(walletAddress);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

// 5. ItemParts 소유권 확인
async function checkItemPartsOwnership(itemPartsAddress, walletAddress, itemPartsIds, provider) {
    try {
        const abi = require("../../../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json").abi;
        const itemParts = new Contract(itemPartsAddress, abi, provider);
        
        const ownershipChecks = [];
        
        for (let i = 0; i < itemPartsIds.length; i++) {
            try {
                const owner = await itemParts.ownerOf(itemPartsIds[i]);
                const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();
                ownershipChecks.push({
                    tokenId: itemPartsIds[i],
                    owner: owner,
                    isOwner: isOwner
                });
            } catch (error) {
                ownershipChecks.push({
                    tokenId: itemPartsIds[i],
                    owner: null,
                    isOwner: false,
                    error: error.message
                });
            }
        }
        
        return ownershipChecks;
    } catch (error) {
        throw new Error(`ItemParts 소유권 확인 실패: ${error.message}`);
    }
}

// 6. STT Permit 서명 생성
async function createPermitSignature(sttAddress, wallet, deadline, amount, main) {
    try {
        const abi = require("../../../artifacts/contracts/SttPermit.sol/SttPermit.json").abi;
        const stt = new Contract(sttAddress, abi, wallet);
        
        const nonce = await stt.nonces(wallet.address);
        const domain = {
            name: await stt.name(),
            version: '1',
            chainId: await wallet.provider.getNetwork().then(net => net.chainId),
            verifyingContract: sttAddress
        };
        
        const types = {
            Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        
        const rewardPoolAddress = await getRewardPoolAddress(main);
        const message = {
            owner: wallet.address,
            spender: rewardPoolAddress,
            value: amount,
            nonce: nonce,
            deadline: deadline
        };
        
        const signature = await wallet._signTypedData(domain, types, message);
        return signature;
    } catch (error) {
        throw new Error(`Permit 서명 생성 실패: ${error.message}`);
    }
}

// 7. RewardPool 주소 가져오기
async function getRewardPoolAddress(main) {
    try {
        const managedContracts = await main.managedContracts(3); // RewardPool은 3번 인덱스
        return managedContracts;
    } catch (error) {
        throw new Error(`RewardPool 주소 조회 실패: ${error.message}`);
    }
}

// 8. buyAgent 실행
async function executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig) {
    try {
        const buyAgentTx = await main.connect(wallet).buyAgent(itemPartsIds, deadline, permitSig);
        const receipt = await buyAgentTx.wait();
        return { transaction: buyAgentTx, receipt };
    } catch (error) {
        throw new Error(`buyAgent 실행 실패: ${error.message}`);
    }
}

// 9. 결과 포맷팅
function formatBuyAgentResult(wallet, buyAgentTx, itemPartsIds, roundId, contractStatus) {
    return {
        buyer: wallet.address,
        transactionHash: buyAgentTx.hash,
        blockNumber: buyAgentTx.receipt.blockNumber,
        itemPartsIds: itemPartsIds,
        roundId: roundId.toString(),
        buyTime: new Date().toISOString(),
        contractStatus: contractStatus
    };
}

// 메인 buyAgent 함수 (순수 함수)
async function buyAgent(mainAddress, itemPartsIds, customProvider = null, customWallet = null) {
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
        const roundId = contractStatus.roundId;
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        
        // 5. 사용자 STT 잔액 확인
        const coinBalance = await getCoinBalance(main, wallet.address);
        
        // 6. ItemParts 소유권 확인
        const itemPartsAddress = await main.managedContracts(1); // ItemParts는 1번 인덱스
        const ownershipChecks = await checkItemPartsOwnership(itemPartsAddress, wallet.address, itemPartsIds, provider);
        
        // 7. STT Permit 서명 생성
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1시간 후 만료
        const amount = ethers.parseEther("1"); // 1 STT
        const sttAddress = await main.managedContracts(4); // STT는 4번 인덱스
        const permitSig = await createPermitSignature(sttAddress, wallet, deadline, amount, main);

        // 8. buyAgent 실행
        const { transaction: buyAgentTx } = await executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig);

        // 9. 결과 포맷팅
        const result = formatBuyAgentResult(wallet, buyAgentTx, itemPartsIds, roundId, contractStatus);

        return result;

    } catch (error) {
        throw error;
    }
}

// 로깅 함수들 (별도로 사용)
function logContractStatus(status) {
    console.log("\n📊 현재 컨트랙트 상태:");
    if (status.roundId !== null) {
        console.log("  - 현재 라운드 ID:", status.roundId.toString());
    } else {
        console.log("  - 현재 라운드 ID: 확인 불가");
    }
    
    if (status.donateAddr !== null) {
        console.log("  - 기부 주소:", status.donateAddr);
    } else {
        console.log("  - 기부 주소: 확인 불가");
    }
    
    if (status.corporateAddr !== null) {
        console.log("  - 영리법인 주소:", status.corporateAddr);
    } else {
        console.log("  - 영리법인 주소: 확인 불가");
    }
    
    if (status.operationAddr !== null) {
        console.log("  - 운영비 주소:", status.operationAddr);
    } else {
        console.log("  - 운영비 주소: 확인 불가");
    }
}

function logRoundStatus(roundStatus) {
    console.log("\n🎯 라운드 상태:");
    const statusNames = ["NotStarted", "Proceeding", "Drawing", "Claiming", "Refunding", "Ended"];
    console.log("  - 상태:", statusNames[roundStatus] || "Unknown");
}

function logOwnershipChecks(ownershipChecks) {
    console.log("\n🔍 ItemParts 소유권 확인:");
    ownershipChecks.forEach((check, index) => {
        console.log(`  ${index + 1}. 토큰 ID: ${check.tokenId}`);
        if (check.owner) {
            console.log(`     소유자: ${check.owner}`);
            console.log(`     소유 여부: ${check.isOwner ? "✅ 소유" : "❌ 미소유"}`);
        } else {
            console.log(`     ⚠️ 토큰 정보를 가져올 수 없습니다: ${check.error}`);
        }
    });
}

function logBuyAgentResult(result) {
    console.log("\n📋 buyAgent 결과 요약:");
    console.log("  - 구매자:", result.buyer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 사용된 ItemParts ID:", result.itemPartsIds.join(", "));
    console.log("  - 라운드 ID:", result.roundId);
    console.log("  - 구매 시간:", result.buyTime);
}

function logBuyAgentProcess(mainAddress, wallet, itemPartsIds, roundStatus, coinBalance, ownershipChecks, buyAgentTx) {
    console.log("🌐 Provider URL:", wallet.provider.connection.url);
    console.log("🎯 Main 컨트랙트 buyAgent를 시작합니다...");
    console.log("🎯 Main 컨트랙트 주소:", mainAddress);
    console.log("🎨 구매자 주소:", wallet.address);
    console.log("🎯 사용할 ItemParts ID:", itemPartsIds.join(", "));
    console.log("📊 라운드 상태:", roundStatus);
    console.log("💰 STT 잔액:", ethers.formatEther(coinBalance));
    console.log("✅ buyAgent 완료! 트랜잭션 해시:", buyAgentTx.hash);
    console.log("📦 블록 번호:", buyAgentTx.receipt.blockNumber);
}

// 모듈로 export
module.exports = { 
    buyAgent,
    initializeContracts,
    getContractStatus,
    getRoundStatus,
    getCoinBalance,
    checkItemPartsOwnership,
    createPermitSignature,
    executeBuyAgent,
    formatBuyAgentResult,
    logContractStatus,
    logRoundStatus,
    logOwnershipChecks,
    logBuyAgentResult,
    logBuyAgentProcess
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error("❌ 사용법: node buyAgent.js <main_contract_address> <itemParts_ids...>");
        console.error("예시: node buyAgent.js 0x123... 1 2 3 4 5");
        process.exit(1);
    }

    const mainAddress = args[0];
    const itemPartsIds = args.slice(1).map(id => parseInt(id));

    if (itemPartsIds.length !== 5) {
        console.error("❌ ItemParts ID는 정확히 5개여야 합니다.");
        process.exit(1);
    }

    buyAgent(mainAddress, itemPartsIds)
        .then((result) => {
            console.log("\n🎉 buyAgent 성공!");
            console.log("결과:", JSON.stringify(result, null, 2));
        })
        .catch((error) => {
            console.error("❌ buyAgent 실패:", error.message);
            process.exit(1);
        });
} 