/**
 * @file buyAgent.js
 * @notice Main 컨트랙트 buyAgent 관련 Library (decimals 대응, Main.Bought 이벤트 파싱)
 * @author
 */
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, AbiCoder, ethers } = require("ethers");
require("dotenv").config();

/**
 * ABI 로딩 헬퍼
 */
function loadAbi(path) {
    return require(path).abi;
}

/**
 * Provider 및 Main 컨트랙트 초기화
 * @param {string} mainAddress Main 컨트랙트 주소
 * @param {JsonRpcProvider} provider 타겟 블록체인 Provider
 * @returns {Contract} Main 컨트랙트 인스턴스
 */
async function initializeContracts(mainAddress, provider) {
    try {
        const abi = loadAbi("../../../artifacts/contracts/Main.sol/Main.json");
        const main = new Contract(mainAddress, abi, provider);
        return main;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * 현재 라운드 ID
 */
async function getRoundId(main) {
    try {
        return await main.roundId();
    } catch {
        return null;
    }
}

/**
 * 특정 라운드 상태
 * @returns 0~5 (NotStarted~Ended)
 */
async function getRoundStatus(main, roundId) {
    try {
        return await main.getRoundStatus(roundId);
    } catch (error) {
        throw new Error(`라운드 상태 확인 실패: ${error.message}`);
    }
}

/**
 * 사용자의 토큰 잔액 (Main.getCoinBalance)
 */
async function getCoinBalance(main, walletAddress) {
    try {
        return await main.getCoinBalance(walletAddress);
    } catch (error) {
        throw new Error(`토큰 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * ItemParts 소유권 확인
 */
async function checkItemPartsOwnership(itemPartsAddress, walletAddress, itemPartsIds, provider) {
    try {
        const abi = loadAbi("../../../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json");
        const itemParts = new Contract(itemPartsAddress, abi, provider);
        const ownershipChecks = [];

        for (let i = 0; i < itemPartsIds.length; i++) {
            try {
                const owner = await itemParts.ownerOf(itemPartsIds[i]);
                const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();
                ownershipChecks.push({ tokenId: itemPartsIds[i], owner, isOwner });
            } catch (error) {
                ownershipChecks.push({ tokenId: itemPartsIds[i], owner: null, isOwner: false, error: error.message });
            }
        }
        return ownershipChecks;
    } catch (error) {
        throw new Error(`ItemParts 소유권 확인 실패: ${error.message}`);
    }
}

/**
 * RewardPool 주소 조회 (Types.ContractTags.RewardPool = 4)
 */
async function getRewardPoolAddress(main) {
    try {
        return await main.managedContracts(4);
    } catch (error) {
        throw new Error(`RewardPool 주소 조회 실패: ${error.message}`);
    }
}

/**
 * Agent 주소 조회 (Types.ContractTags.Agent = 2)
 */
async function getAgentAddress(main) {
    try {
        return await main.managedContracts(2);
    } catch (error) {
        throw new Error(`Agent 주소 확인 실패: ${error.message}`);
    }
}

/**
 * Agent type 조회 (옵션)
 */
async function getAgentType(agentAddress, tokenId, provider) {
    try {
        const abi = loadAbi("../../../artifacts/contracts/Agent.sol/AgentNFT.json");
        const agent = new Contract(agentAddress, abi, provider);
        return await agent.typeOf(tokenId);
    } catch (error) {
        throw new Error(`Agent type 확인 실패: ${error.message}`);
    }
}

/**
 * [핵심] 수수료 토큰(=Stt 슬롯) 정보 읽기: 주소/decimals/symbol
 *   - Types.ContractTags.Stt = 7
 */
async function getFeeTokenInfo(main, provider) {
    const tokenAddress = await main.managedContracts(7);
    const erc20MinimalAbi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function nonces(address) view returns (uint256)"
    ];
    const token = new Contract(tokenAddress, erc20MinimalAbi, provider);

    let symbol = "TOKEN";
    try {
        symbol = await token.symbol();
    } catch {
        // 일부 토큰은 symbol() 미구현일 수 있음 → 기본값 유지
    }
    const decimals = Number(await token.decimals());
    return { address: tokenAddress, symbol, decimals, token };
}

/**
 * EIP-2612 Permit 서명 생성 (value는 토큰 decimals 기준 단위)
 */
async function createPermitSignature(tokenAddress, wallet, deadline, amount, main) {
    try {
        const erc20PermitAbi = [
            "function name() view returns (string)",
            "function nonces(address) view returns (uint256)"
        ];
        const token = new Contract(tokenAddress, erc20PermitAbi, wallet);

        const nonce = await token.nonces(wallet.address);
        const domain = {
            name: await token.name(),
            version: "1",
            chainId: (await wallet.provider.getNetwork()).chainId,
            verifyingContract: tokenAddress
        };
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };
        const rewardPoolAddress = await getRewardPoolAddress(main);
        const message = {
            owner: wallet.address,
            spender: rewardPoolAddress,
            value: amount,                 // bigint (decimals 반영)
            nonce: nonce,                  // bigint
            deadline: BigInt(deadline)     // bigint
        };

        const signature = await wallet.signTypedData(domain, types, message);
        return signature;
    } catch (error) {
        throw new Error(`Permit 서명 생성 실패: ${error.message}`);
    }
}

/**
 * buyAgent 실행 (Main.Bought 이벤트 파싱)
 */
async function executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig) {
    try {
        const buyAgentTx = await main.connect(wallet).buyAgent(itemPartsIds, deadline, permitSig, {
            gasLimit: 1_500_000n
        });
        const receipt = await buyAgentTx.wait();

        // EIP-1559: effectiveGasPrice 사용
        const price = receipt.effectiveGasPrice ?? buyAgentTx.gasPrice ?? 0n;
        const cost = receipt.gasUsed * price;

        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${buyAgentTx.gasLimit?.toString?.() ?? "auto"}`);
        console.log(`💰 Gas 비용(네이티브): ${ethers.formatEther(cost)} ETH`);

        // Main의 Bought 이벤트 파싱 (가장 확실)
        // event Bought(address indexed buyer, uint256 indexed roundId, uint256 indexed agentId, uint256 depositAmount, uint256 burnedParts0, ...4)
        let mintedAgent = null;
        for (const log of receipt.logs) {
            // 주소 필터 (해당 Main 컨트랙트 로그만 시도)
            if (log.address?.toLowerCase?.() !== main.target.toLowerCase()) continue;

            try {
                const parsed = main.interface.parseLog(log);
                if (parsed?.name === "Bought") {
                    const args = parsed.args;
                    mintedAgent = {
                        tokenId: args.agentId.toString(),
                        owner: args.buyer,
                        agentType: null, // 필요시 getAgentType으로 조회
                        itemPartsIds: [
                            args.burnedParts0.toString(),
                            args.burnedParts1.toString(),
                            args.burnedParts2.toString(),
                            args.burnedParts3.toString(),
                            args.burnedParts4.toString()
                        ]
                    };

                    // 옵션: Agent type 조회
                    try {
                        const agentAddress = await getAgentAddress(main);
                        const agentType = await getAgentType(agentAddress, args.agentId, wallet.provider);
                        mintedAgent.agentType = agentType.toString();
                    } catch (e) {
                        console.log("⚠️ Agent type 확인 실패:", e.message);
                    }
                    break; // 첫 매칭만 사용
                }
            } catch {
                // 다른 이벤트/ABI 미매칭 → 무시
            }
        }

        return { transaction: buyAgentTx, receipt, mintedAgent };
    } catch (error) {
        throw new Error(`buyAgent 실행 실패: ${error.message}`);
    }
}

/**
 * 메인 buyAgent 함수
 */
async function buyAgent(mainAddress, itemPartsIds, customProvider = null, customWallet = null) {
    try {
        // 1) Provider/Wallet
        let provider, wallet;
        if (customProvider && customWallet) {
            provider = customProvider;
            wallet = customWallet;
        } else {
            const providerUrl = process.env.PROVIDER_URL || "http://localhost:8545";
            const privateKey = process.env.PRIVATE_KEY;
            if (!privateKey) throw new Error("❌ .env 파일에 PRIVATE_KEY가 설정되지 않았습니다.");
            provider = new JsonRpcProvider(providerUrl);
            wallet = new Wallet(privateKey, provider);
        }

        // 2) Main
        const main = await initializeContracts(mainAddress, provider);

        // 3) 라운드/상태
        const roundId = await getRoundId(main);
        const roundStatus = await getRoundStatus(main, roundId);
        if (roundStatus !== 1n) {
            throw new Error('❌ 현재 라운드상태가 "Proceeding"이 아닙니다.');
        }

        // 4) [DECIMALS] 수수료 토큰 정보 및 1 단위 계산
        const { address: tokenAddress, symbol, decimals } = await getFeeTokenInfo(main, provider);
        const oneToken = ethers.parseUnits("1", decimals); // USDT=1e6, ERC20(18)=1e18

        // 5) 잔액 확인 (Main.getCoinBalance는 동일 토큰 단위 반환)
        const coinBalance = await getCoinBalance(main, wallet.address);
        if (coinBalance < oneToken) {
            const have = ethers.formatUnits(coinBalance, decimals);
            throw new Error(`❌ 잔액 부족. 필요: 1 ${symbol}, 보유: ${have} ${symbol}`);
        }

        // 6) ItemParts 소유권
        const itemPartsAddress = await main.managedContracts(1); // Types.ContractTags.ItemParts = 1
        const ownershipChecks = await checkItemPartsOwnership(itemPartsAddress, wallet.address, itemPartsIds, provider);
        const nonOwnedTokens = ownershipChecks.filter(c => !c.isOwner);
        if (nonOwnedTokens.length > 0) {
            const ids = nonOwnedTokens.map(c => c.tokenId).join(", ");
            throw new Error(`❌ 소유하지 않은 ItemParts가 있습니다. Token IDs: ${ids}`);
        }

        // 7) [DECIMALS] Permit 서명 (value=1 토큰 단위)
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1시간
        const permitSig = await createPermitSignature(tokenAddress, wallet, deadline, oneToken, main);

        // 8) buyAgent 실행
        const { transaction: buyAgentTx, receipt, mintedAgent } =
            await executeBuyAgent(main, wallet, itemPartsIds, deadline, permitSig);

        // 9) 결과 반환
        return {
            buyer: wallet.address,
            transactionHash: buyAgentTx.hash,
            blockNumber: receipt.blockNumber,
            itemPartsIds,
            roundId: roundId.toString(),
            mintedAgent
        };
    } catch (error) {
        throw error;
    }
}

/**
 * 결과 로그
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
        console.log("  - Agent Type:", result.mintedAgent.agentType ?? "⚠️ 확인 실패");
        console.log("  - 사용된 ItemParts ID:", result.mintedAgent.itemPartsIds.join(", "));
    } else {
        console.log("  - ⚠️ Agent NFT 이벤트 파싱 실패");
    }
}

module.exports = { buyAgent, logResult };

/**
 * 직접 실행(테스트)
 * 사용법: node buyAgent.js <main_contract_address> <itemParts_ids...>
 * 예시:  node buyAgent.js 0x123... 1 2 3 4 5
 */
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error("❌ 사용법: node buyAgent.js <main_contract_address> <itemParts_ids...>");
        console.error("예시: node buyAgent.js 0x123... 1 2 3 4 5");
        process.exit(1);
    }

    const mainAddress = args[0];
    const itemPartsIds = args.slice(1).map(Number);
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
