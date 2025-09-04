/**
 * @file buyAgent.js
 * @notice Main 컨트랙트 buyAgent 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, ethers } = require("ethers");
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

/**
 * @notice Provider 및 Contract 초기화
 * @param {*} mainAddress Main 컨트랙트 주소
 * @param {*} provider 타겟 블록체인 SP URL
 * @returns Main Contract Object
 */
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
 * @notice 사용자의 Token 토큰 잔액을 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} walletAddress 확인할 지갑 주소
 * @returns Token 토큰 잔액
 */
async function getCoinBalance(main, walletAddress) {
    try {
        const balance = await main.getCoinBalance(walletAddress);
        return balance;
    } catch (error) {
        throw new Error(`Token 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * @notice 수수료 토큰 decimals 조회 (Types.ContractTags.Token = 7)
 * @param {*} main Main 컨트랙트 주소
 * @param {*} provider Provider 객체
 * @returns 토큰 decimal 반환
 */
async function getTokenDecimals(main, provider) {
    const tokenAddress = await main.managedContracts(7);
    const erc20MinimalAbi = ["function decimals() view returns (uint8)"];
    const token = new Contract(tokenAddress, erc20MinimalAbi, provider);
    const d = await token.decimals();
    return Number(d);
}


/**
 * @notice ItemParts NFT의 소유권을 확인한다.
 * @param {*} itemPartsAddress ItemParts 컨트랙트 주소
 * @param {*} walletAddress 확인할 지갑 주소
 * @param {*} itemPartsIds 확인할 ItemParts ID 배열
 * @param {*} provider Provider 객체
 * @returns 소유권 확인 결과 배열
 */
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

/**
 * @notice Token 토큰의 permit 서명을 생성한다.
 * @dev EIP-2612 표준을 따른다.
 * @param {*} tokenAddress Token 토큰 컨트랙트 주소
 * @param {*} wallet 서명할 지갑
 * @param {*} deadline 서명 만료 시간
 * @param {*} amount 허용할 토큰 양
 * @param {*} main Main 컨트랙트 주소
 * @returns permit 서명
 */
async function createPermitSignature(tokenAddress, wallet, deadline, amount, main) {
    try {
        let abiPath;
        if(process.env.USE_STABLE_COIN == '1') {
            abiPath = "../../../artifacts/contracts/StableCoin.sol/StableCoin.json";
        } else {
            abiPath = "../../../artifacts/contracts/SttPermit.sol/SttPermit.json";
        }
        const abi = require(abiPath).abi;
        const token = new Contract(tokenAddress, abi, wallet);
        
        const nonce = await token.nonces(wallet.address);
        const domain = {
            name: await token.name(),
            version: '1',
            chainId: await wallet.provider.getNetwork().then(net => net.chainId),
            verifyingContract: tokenAddress
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
        
        const signature = await wallet.signTypedData(domain, types, message);
        return signature;
    } catch (error) {
        throw new Error(`Permit 서명 생성 실패: ${error.message}`);
    }
}

/**
 * @notice RewardPool 컨트랙트 주소를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @returns RewardPool 컨트랙트 주소
 */
async function getRewardPoolAddress(main) {
    try {
        const managedContracts = await main.managedContracts(4); // RewardPool은 4번 인덱스
        return managedContracts;
    } catch (error) {
        throw new Error(`RewardPool 주소 조회 실패: ${error.message}`);
    }
}

/**
 * @notice Agent 컨트랙트 주소를 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @returns Agent 컨트랙트 주소
 */
async function getAgentAddress(main) {
    try {
        const agentAddress = await main.managedContracts(2); // Agent는 2번 인덱스
        return agentAddress;
    } catch (error) {
        throw new Error(`Agent 주소 확인 실패: ${error.message}`);
    }
}

/**
 * @notice Agent NFT의 type을 반환한다.
 * @param {*} agentAddress Agent 컨트랙트 주소
 * @param {*} tokenId Agent 토큰 ID
 * @param {*} provider Provider 객체
 * @returns Agent type
 */
async function getAgentType(agentAddress, tokenId, provider) {
    try {
        const abi = require("../../../artifacts/contracts/Agent.sol/AgentNFT.json").abi;
        const agent = new Contract(agentAddress, abi, provider);
        const agentType = await agent.typeOf(tokenId);
        return agentType;
    } catch (error) {
        throw new Error(`Agent type 확인 실패: ${error.message}`);
    }
}

/**
 * @notice buyAgent 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} wallet 구매자 지갑
 * @param {*} itemPartsIds 사용할 ItemParts ID 배열
 * @param {*} deadline permit 만료 시간
 * @param {*} permitSig permit 서명
 * @returns 트랜잭션 정보 (transaction, receipt, mintedAgent)
 */
async function executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig) {
    try {
        const buyAgentTx = await main.connect(wallet).buyAgent(itemPartsIds, deadline, permitSig, {
            gasLimit: 1500000
        });
        const receipt = await buyAgentTx.wait();

        // Gas 사용량 출력 (기존 유지)
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${buyAgentTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        let mintedAgent = null;
        for (const log of receipt.logs) {
            // 해당 트랜잭션 로그 중 Main 컨트랙트에서 발생한 것만 시도
            if (log.address?.toLowerCase?.() !== main.target.toLowerCase()) {
                continue;
            }
            try {
                const parsed = main.interface.parseLog(log);
                if (parsed?.name === "Bought") {
                    const a = parsed.args;

                    // (옵션) Agent type 조회 유지
                    let agentType = null;
                    try {
                        const agentAddress = await getAgentAddress(main);
                        agentType = await getAgentType(agentAddress, a.agentId, wallet.provider);
                    } catch (error) {
                        console.log("⚠️ Agent type 확인 실패:", error.message);
                    }

                    mintedAgent = {
                        tokenId: a.agentId.toString(),
                        owner: a.buyer,
                        agentType: agentType ? agentType.toString() : null,
                        itemPartsIds: [
                            a.burnedParts0.toString(),
                            a.burnedParts1.toString(),
                            a.burnedParts2.toString(),
                            a.burnedParts3.toString(),
                            a.burnedParts4.toString()
                        ]
                    };
                    break; // 첫 번째 Bought 이벤트만 사용
                }
            } catch (error) {
                // 다른 이벤트/미매칭은 무시하고 계속
            }
        }
        return { transaction: buyAgentTx, receipt, mintedAgent };
    } catch (error) {
        throw new Error(`buyAgent 실행 실패: ${error.message}`);
    }
}


// 메인 buyAgent 함수 (순수 함수)
/**
 * @notice buyAgent를 수행한다.
 * @param {*} mainAddress Main 컨트랙트 주소
 * @param {*} itemPartsIds 사용할 ItemParts ID 배열
 * @param {*} customProvider provider 정보 (optional)
 * @param {*} customWallet wallet 정보 (optional)
 * @returns 
 */
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
        
        // 3. 라운드번호 확인
        const roundId = await getRoundId(main);
        
        // 4. 라운드 상태 확인
        const roundStatus = await getRoundStatus(main, roundId);
        if(roundStatus != 1n) {
            throw new Error("❌ 현재 라운드상태가 \"Proceeding\"이 아닙니다.");
        }
        
        // 5. 사용자 토큰 잔액 확인 (decimals 반영)
        const decimals = await getTokenDecimals(main, provider);
        const coinBalance = await getCoinBalance(main, wallet.address);
        const requiredAmount = ethers.parseUnits("1", decimals); // 6/18 자동 호환
        if (coinBalance < requiredAmount) {
            const have = ethers.formatUnits(coinBalance, decimals);
            throw new Error(`❌ 잔액이 부족합니다. 필요: 1, 보유: ${have}`);
        }
        
        // 6. ItemParts 소유권 확인
        const itemPartsAddress = await main.managedContracts(1); // ItemParts는 1번 인덱스
        const ownershipChecks = await checkItemPartsOwnership(itemPartsAddress, wallet.address, itemPartsIds, provider);
        
        // 소유권 검사
        const nonOwnedTokens = ownershipChecks.filter(check => !check.isOwner);
        if (nonOwnedTokens.length > 0) {
            const nonOwnedIds = nonOwnedTokens.map(check => check.tokenId).join(", ");
            throw new Error(`❌ 소유하지 않은 ItemParts가 있습니다. Token IDs: ${nonOwnedIds}`);
        }
        
        // 7. Permit 서명 생성 (decimals 반영)
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const amount = requiredAmount; // 위에서 만든 1 토큰(decimals 반영)
        const tokenAddress = await main.managedContracts(7);
        const permitSig = await createPermitSignature(tokenAddress, wallet, deadline, amount, main);


        // 8. buyAgent 실행
        const { transaction: buyAgentTx, receipt, mintedAgent } = await executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig);

        // 9. 결과 포맷팅
        // const result = formatBuyAgentResult(wallet, buyAgentTx, receipt, itemPartsIds, roundId, mintedAgent);
        const result = {
            buyer: wallet.address,
            transactionHash: buyAgentTx.hash,
            blockNumber: receipt.blockNumber,
            itemPartsIds: itemPartsIds,
            roundId: roundId.toString(),
            mintedAgent: mintedAgent
        };

        return result;

    } catch (error) {
        throw error;
    }
}

/**
 * @notice buyAgent 결과를 출력한다.
 * @param {*} result buyAgent 결과물
 */
function logResult(result) {
    console.log("\n📋 buyAgent Reports:");
    console.log("  - 구매자:", result.buyer);
    console.log("  - 트랜잭션 해시:", result.transactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 사용된 ItemParts ID:", result.itemPartsIds.join(", "));
    console.log("  - 라운드 ID:", result.roundId);
    
    if (result.mintedAgent) {
        console.log("  - 민팅된 Agent ID:", result.mintedAgent.tokenId);
        console.log("  - Agent 소유자:", result.mintedAgent.owner);
        if (result.mintedAgent.agentType) {
            console.log("  - Agent Type:", result.mintedAgent.agentType);
        } else {
            console.log("  - Agent Type: ⚠️ 확인 실패");
        }
        console.log("  - 사용된 ItemParts ID:", result.mintedAgent.itemPartsIds.join(", "));
    } else {
        console.log("  - ⚠️ Agent NFT 이벤트 파싱 실패");
    }
}

// 모듈로 export
module.exports = { 
    buyAgent,
    logResult
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