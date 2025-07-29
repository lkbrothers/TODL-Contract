/**
 * @file buyAgent.js
 * @notice Main 컨트랙트 buyAgent 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, getBigInt, getAddress, AbiCoder, ethers } = require("ethers");
require('dotenv').config();

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
 * @notice 사용자의 STT 토큰 잔액을 반환한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} walletAddress 확인할 지갑 주소
 * @returns STT 토큰 잔액
 */
async function getCoinBalance(main, walletAddress) {
    try {
        const balance = await main.getCoinBalance(walletAddress);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
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
 * @notice STT 토큰의 permit 서명을 생성한다.
 * @dev EIP-2612 표준을 따른다.
 * @param {*} sttAddress STT 토큰 컨트랙트 주소
 * @param {*} wallet 서명할 지갑
 * @param {*} deadline 서명 만료 시간
 * @param {*} amount 허용할 토큰 양
 * @param {*} main Main 컨트랙트 주소
 * @returns permit 서명
 */
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
        console.log('>>>>>>>', agentType, tokenId)
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
        const buyAgentTx = await main.connect(wallet).buyAgent(itemPartsIds, deadline, permitSig);
        const receipt = await buyAgentTx.wait();
        
        // Agent NFT Minted 이벤트 파싱
        let mintedAgent = null;
        for (const log of receipt.logs) {
            try {
                // Agent NFT Minted 이벤트 시그니처:
                const eventSignature = "Minted(uint256,address,uint256,uint256,uint256,uint256,uint256)";
                const eventTopic = keccak256(toUtf8Bytes(eventSignature));
                
                if (log.topics[0] === eventTopic) {
                    // 이벤트 데이터 파싱
                    const tokenId = getBigInt(log.topics[1]); // indexed parameter
                    
                    // 32바이트 패딩된 주소에서 하위 20바이트 추출
                    const paddedAddress = log.topics[2];
                    const owner = "0x" + paddedAddress.slice(-40); // 하위 20바이트 (40자)
                    
                    // data 필드에서 itemPartsIds 파싱 (5개의 uint256)
                    const abiCoder = new AbiCoder();
                    const decodedData = abiCoder.decode(['uint256', 'uint256', 'uint256', 'uint256', 'uint256'], log.data);
                    
                    // Agent type 확인
                    let agentType = null;
                    try {
                        const agentAddress = await getAgentAddress(main);
                        console.log('>>>>>>>', agentAddress, tokenId)
                        agentType = await getAgentType(agentAddress, tokenId, wallet.provider);
                    } catch (error) {
                        console.log("⚠️ Agent type 확인 실패:", error.message);
                    }
                    
                    mintedAgent = {
                        tokenId: tokenId.toString(),
                        owner: owner,
                        agentType: agentType ? agentType.toString() : null,
                        itemPartsIds: [
                            decodedData[0].toString(),
                            decodedData[1].toString(),
                            decodedData[2].toString(),
                            decodedData[3].toString(),
                            decodedData[4].toString()
                        ]
                    };
                    break; // 첫 번째 Minted 이벤트만 처리
                }
            } catch (error) {
                // 이벤트 파싱 실패 시 무시하고 계속 진행
                console.log("⚠️ Agent NFT 이벤트 파싱 실패:", error.message);
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
        
        // 5. 사용자 STT 잔액 확인
        const coinBalance = await getCoinBalance(main, wallet.address);
        const requiredAmount = ethers.parseEther("1"); // 1 STT
        if(coinBalance < requiredAmount) {
            throw new Error(`❌ STT 잔액이 부족합니다. 필요: 1 STT, 보유: ${ethers.formatEther(coinBalance)} STT`);
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
        
        // 7. STT Permit 서명 생성
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1시간 후 만료
        const amount = ethers.parseEther("1"); // 1 STT
        const sttAddress = await main.managedContracts(7); // STT는 7번 인덱스
        const permitSig = await createPermitSignature(sttAddress, wallet, deadline, amount, main);

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