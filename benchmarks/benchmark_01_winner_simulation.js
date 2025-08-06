/**
 * @file benchmark_01_winner_simulation.js
 * @title Benchmark 01: 라운드 winner 시뮬레이션
 * @author hlibbc
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { ethers } = require("hardhat");

/**
 * @notice 실제 사용 패턴을 반영한 라운드 시뮬레이션
 * @dev
 * 시나리오:
 * 1. 100개 주소에 1 ETH, 10 STT씩 입금
 * 2. 라운드 시작
 * 3. 각 주소별로 ItemParts 10회 민팅 (최대 50개까지)
 * 4. 부위별로 배열을 만들고 가장 짧은 부위 기준으로 Agent 구매
 * 5. 주소별 Agent 생성 개수 통계
 */
async function main() {
    let main, itemParts, agent, rewardPool, stt, rng, stakePool, reserv;
    let owner, admin1, admin2;
    let users = [];
    let userAddresses = [];
    
    // 벤치마크 설정
    const USER_COUNT = 100;
    const ITEM_PARTS_MINT_PER_USER = 10;
    const MAX_ITEM_PARTS_PER_ROUND = 50;
    
    // 통계 데이터
    let benchmarkStats = {
        totalItemPartsMinted: 0,
        totalAgentsCreated: 0,
        agentsPerUser: {},
        partsDistribution: {
            Head: 0,
            Body: 0,
            Legs: 0,
            RHand: 0,
            LHand: 0
        },
        roundStats: {
            roundId: 0,
            startTime: 0,
            endTime: 0,
            duration: 0
        }
    };

    console.log("🚀 벤치마크 01 시작: 라운드 시뮬레이션");
    console.log(`📊 설정: ${USER_COUNT}명의 사용자, 사용자당 ${MAX_ITEM_PARTS_PER_ROUND}개 ItemParts 민팅`);
    
    // 환경변수에서 주요 주소들 읽기
    const adminAddress = process.env.ADMIN_ADDRESS;
    const carrierAddress = process.env.CARRIER_ADDRESS;
    const donateAddress = process.env.DONATE_ADDRESS;
    const corporateAddress = process.env.CORPORATE_ADDRESS;
    const operationAddress = process.env.OPERATION_ADDRESS;
    
    if (!adminAddress || !carrierAddress || !donateAddress || !corporateAddress || !operationAddress) {
        throw new Error("❌ .env 파일에 ADMIN_ADDRESS, CARRIER_ADDRESS, DONATE_ADDRESS, CORPORATE_ADDRESS, OPERATION_ADDRESS를 모두 설정해야 합니다.");
    }

    const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL || "http://localhost:8545");
    const ownerKey = process.env.OWNER_KEY;
    if  (!ownerKey) {
        throw new Error("❌ .env 파일에 OWNER_KEY를 설정해야 합니다.");
    }
    const ownerWallet = new ethers.Wallet(ownerKey, provider);
    const adminKey = process.env.ADMIN_KEY;
    if  (!adminKey) {
        throw new Error("❌ .env 파일에 ADMIN_KEY를 설정해야 합니다.");
    }
    const adminWallet = new ethers.Wallet(adminKey, provider);
    
    // 주요 계정들을 환경변수 주소로 설정
    admin1 = { address: adminAddress };
    admin2 = { address: carrierAddress };
    
    // 100개의 사용자 주소를 ethers.Wallet로 생성
    users = [];
    userAddresses = [];
    
    for (let i = 0; i < USER_COUNT; i++) {
        // private key 없이 지갑 생성 (더 빠름)
        const wallet = ethers.Wallet.createRandom();
        
        users.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            wallet: wallet
        });
        userAddresses.push(wallet.address);
    }
    
    console.log(`👥 주요 계정 설정 완료:`);
    console.log(`   - Owner: ${ownerWallet.address}`);
    console.log(`   - Admin1: ${admin1.address}`);
    console.log(`   - Admin2: ${admin2.address}`);
    console.log(`   - 사용자 ${userAddresses.length}명 생성 완료`);

    console.log("\n📋 1단계: 컨트랙트 배포 및 초기 설정");
        
    // 컨트랙트 배포
    const Main = await ethers.getContractFactory("Main");
    const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
    const Agent = await ethers.getContractFactory("AgentNFT");
    const RewardPool = await ethers.getContractFactory("RewardPool");
    const SttPermitFactory = await ethers.getContractFactory("SttPermit");
    const Rng = await ethers.getContractFactory("Rng");
    const StakePool = await ethers.getContractFactory("StakePool");
    const Reserv = await ethers.getContractFactory("Reserv");
    
    // Main 컨트랙트들 배포
    main = await Main.connect(ownerWallet).deploy(
        [admin1.address, admin2.address], 
        donateAddress,
        corporateAddress,
        operationAddress
    );
    await main.waitForDeployment();
    const mainAddr = await main.getAddress();

    
    // STT 토큰 배포
    stt = await SttPermitFactory.deploy();
    await stt.waitForDeployment();
    const sttAddr = await stt.getAddress();

    // 다른 컨트랙트들 배포
    itemParts = await ItemParts.connect(ownerWallet).deploy(mainAddr);
    await itemParts.waitForDeployment();
    const itemPartsAddr = await itemParts.getAddress();

    agent = await Agent.connect(ownerWallet).deploy(mainAddr);
    await agent.waitForDeployment();
    const agentAddr = await agent.getAddress();

    rewardPool = await RewardPool.connect(ownerWallet).deploy(mainAddr, sttAddr);
    await rewardPool.waitForDeployment();
    const rewardPoolAddr = await rewardPool.getAddress();

    rng = await Rng.connect(ownerWallet).deploy(mainAddr, admin1.address);
    await rng.waitForDeployment();
    const rngAddr = await rng.getAddress();

    stakePool = await StakePool.connect(ownerWallet).deploy(sttAddr);
    await stakePool.waitForDeployment();
    const stakePoolAddr = await stakePool.getAddress();

    reserv = await Reserv.connect(ownerWallet).deploy();
    await reserv.waitForDeployment();
    const reservAddr = await reserv.getAddress();
        
    // Main 컨트랙트에 관리 컨트랙트들 설정
    await main.setContracts([
        itemPartsAddr,
        agentAddr,
        rngAddr,
        rewardPoolAddr,
        stakePoolAddr,
        reservAddr,
        sttAddr
    ]);
    
    console.log("✅ 컨트랙트 배포 완료");
    console.log(`   - Main: ${mainAddr}`);
    console.log(`   - ItemParts: ${itemPartsAddr}`);
    console.log(`   - Agent: ${agentAddr}`);
    console.log(`   - RewardPool: ${rewardPoolAddr}`);
    console.log(`   - STT: ${sttAddr}`);
    console.log(`   - Rng: ${rngAddr}`);
    console.log(`   - StakePool: ${stakePoolAddr}`);
    console.log(`   - Reserv: ${reservAddr}`);

    console.log("\n💰 2단계: 사용자들에게 초기 자금 지급");
        
    const ethAmount = ethers.parseEther("1");
    const sttAmount = ethers.parseEther("10");
    
    for (let i = 0; i < userAddresses.length; i++) {
        // ETH 전송 (owner가 실제 signer여야 함)
        await ownerWallet.sendTransaction({
            to: userAddresses[i],
            value: ethAmount
        });
        
        // STT 토큰 전송
        await stt.connect(ownerWallet).transfer(userAddresses[i], sttAmount);
        
        if (i % 20 === 0) {
            console.log(`   진행률: ${i + 1}/${userAddresses.length} 사용자 처리 완료`);
        }
    }
    
    console.log("✅ 모든 사용자에게 초기 자금 지급 완료");
    console.log(`   - ETH: 1 ETH씩 ${userAddresses.length}명`);
    console.log(`   - STT: 10 STT씩 ${userAddresses.length}명`);

    console.log("\n🎯 3단계: 라운드 시작");
        
    // 라운드 시작 (admin1이 실제 signer여야 함)
    const currentRoundId = await main.roundId();
    const roundId = currentRoundId + 1n;
    const buf = crypto.randomBytes(32);
    const hexStr = '0x' + buf.toString('hex');
    const randSeed = hexStr;

    const signature = await createSignature(adminWallet, rngAddr, roundId, randSeed);
    
    const startRoundTx = await main.connect(adminWallet).startRound(signature, {
        gasLimit: 300000
    });
    const receipt = await startRoundTx.wait();
    
    // Gas 사용량 출력
    console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${startRoundTx.gasLimit.toString()}`);
    console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);

    benchmarkStats.roundStats.roundId = roundId.toNumber();
    benchmarkStats.roundStats.startTime = Date.now();
    
    console.log(`✅ 라운드 ${roundId} 시작 완료`);
    console.log(`   - 시작 시간: ${new Date().toISOString()}`);

    console.log("\n🎨 4단계: ItemParts 민팅 및 Agent 구매");
        
    for (let userIndex = 0; userIndex < userAddresses.length; userIndex++) {
        const user = users[userIndex];
        const userAddress = userAddresses[userIndex];
        
        console.log(`\n👤 사용자 ${userIndex + 1}/${userAddresses.length} 처리 중...`);
        
        // 사용자별 Agent 생성 개수 초기화
        benchmarkStats.agentsPerUser[userAddress] = 0;
        
        // ItemParts 민팅 (최대 10회)
        const mintedParts = {
            Head: [],
            Body: [],
            Legs: [],
            RHand: [],
            LHand: []
        };
        
        for (let mintCount = 0; mintCount < ITEM_PARTS_MINT_PER_USER; mintCount++) {
            try {
                // ItemParts 민팅 (사용자 wallet로 서명)
                const userWallet = new ethers.Wallet(user.privateKey, ethers.provider);
                const mintTx = await itemParts.connect(userWallet).mint();
                const receipt = await mintTx.wait();
                
                // 민팅된 NFT ID 추출
                const event = receipt.logs.find(log => 
                    log.fragment && log.fragment.name === 'Transfer'
                );
                
                if (event) {
                    const tokenId = event.args[2];
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    const partsId = tokenInfo[0];
                    
                    // 부위별로 분류
                    const partsNames = ['Head', 'Body', 'Legs', 'RHand', 'LHand'];
                    const partsName = partsNames[partsId];
                    mintedParts[partsName].push(tokenId);
                    
                    benchmarkStats.partsDistribution[partsName]++;
                    benchmarkStats.totalItemPartsMinted++;
                }
                
            } catch (error) {
                console.log(`   ⚠️  사용자 ${userIndex + 1}의 ${mintCount + 1}번째 민팅 실패: ${error.message}`);
                break; // 민팅 실패 시 중단
            }
        }
        
        // 부위별 배열에서 가장 짧은 부위 찾기
        const partsLengths = Object.values(mintedParts).map(parts => parts.length);
        const minLength = Math.min(...partsLengths);
        
        console.log(`   📦 민팅된 파츠: ${JSON.stringify(mintedParts, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
        )}`);
        console.log(`   📏 최소 부위 길이: ${minLength}`);
        
        // 최소 길이만큼 Agent 구매 시도
        for (let agentIndex = 0; agentIndex < minLength; agentIndex++) {
            try {
                // 각 부위에서 하나씩 선택
                const itemPartsIds = [
                    mintedParts.Head[agentIndex],
                    mintedParts.Body[agentIndex],
                    mintedParts.Legs[agentIndex],
                    mintedParts.RHand[agentIndex],
                    mintedParts.LHand[agentIndex]
                ];
                
                // STT 승인
                const sttAmount = ethers.parseEther("1");
                const userWallet = new ethers.Wallet(user.privateKey, ethers.provider);
                
                // Permit 서명 생성
                const deadline = Math.floor(Date.now() / 1000) + 3600;
                const domain = {
                    name: await stt.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: stt.address
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
                
                const nonce = await stt.nonces(userAddress);
                const value = sttAmount;
                const signature = await userWallet.signTypedData(domain, types, {
                    owner: userAddress,
                    spender: rewardPoolAddr,
                    value: value,
                    nonce: nonce,
                    deadline: deadline
                });
            
                // Agent 구매
                const buyAgentTx = await main.connect(userWallet).buyAgent(
                    itemPartsIds,
                    deadline,
                    signature
                );
                await buyAgentTx.wait();
                
                benchmarkStats.agentsPerUser[userAddress]++;
                benchmarkStats.totalAgentsCreated++;
                
                console.log(`   ✅ Agent ${agentIndex + 1} 구매 성공`);
                
            } catch (error) {
                console.log(`   ❌ Agent ${agentIndex + 1} 구매 실패: ${error.message}`);
                break; // Agent 구매 실패 시 중단
            }
        }
        
        console.log(`   📊 사용자 ${userIndex + 1} 결과: ${benchmarkStats.agentsPerUser[userAddress]}개 Agent 생성`);
    }


    //// 여기에 해줘
    
    console.log("\n🔒 4단계: 라운드 종료");
    console.log("=".repeat(50));
    
    try {
        // 1. closeTicketRound 호출
        console.log("   🔒 closeTicketRound 호출 중...");
        const closeTicketTx = await main.closeTicketRound();
        await closeTicketTx.wait();
        console.log("   ✅ closeTicketRound 성공");
        
        // 2. settleRound 호출 (랜덤 시드 필요)
        console.log("   🎲 settleRound 호출 중...");
        const settleRoundTx = await main.settleRound(randSeed);
        await settleRoundTx.wait();
        console.log("   ✅ settleRound 성공");
        
        console.log("   🎉 라운드 정상 종료 완료!");
        
    } catch (error) {
        console.log(`   ❌ 라운드 종료 실패: ${error.message}`);
        throw error;
    }

    console.log("\n📊 5단계: 벤치마크 결과 분석");
        
    benchmarkStats.roundStats.endTime = Date.now();
    benchmarkStats.roundStats.duration = benchmarkStats.roundStats.endTime - benchmarkStats.roundStats.startTime;
    
    // 통계 계산
    const totalUsers = userAddresses.length;
    const successfulUsers = Object.values(benchmarkStats.agentsPerUser).filter(count => count > 0).length;
    const averageAgentsPerUser = benchmarkStats.totalAgentsCreated / totalUsers;
    const maxAgentsPerUser = Math.max(...Object.values(benchmarkStats.agentsPerUser));
    const minAgentsPerUser = Math.min(...Object.values(benchmarkStats.agentsPerUser));
    
    console.log("\n🎯 벤치마크 결과:");
    console.log("=".repeat(50));
    console.log(`📈 전체 통계:`);
    console.log(`   - 총 사용자 수: ${totalUsers}명`);
    console.log(`   - Agent 생성 성공 사용자: ${successfulUsers}명 (${(successfulUsers/totalUsers*100).toFixed(1)}%)`);
    console.log(`   - 총 ItemParts 민팅: ${benchmarkStats.totalItemPartsMinted}개`);
    console.log(`   - 총 Agent 생성: ${benchmarkStats.totalAgentsCreated}개`);
    console.log(`   - 평균 Agent/사용자: ${averageAgentsPerUser.toFixed(2)}개`);
    console.log(`   - 최대 Agent/사용자: ${maxAgentsPerUser}개`);
    console.log(`   - 최소 Agent/사용자: ${minAgentsPerUser}개`);
    
    console.log(`\n🎨 파츠 분포:`);
    Object.entries(benchmarkStats.partsDistribution).forEach(([part, count]) => {
        console.log(`   - ${part}: ${count}개 (${(count/benchmarkStats.totalItemPartsMinted*100).toFixed(1)}%)`);
    });
    
    console.log(`\n⏱️  실행 시간:`);
    console.log(`   - 시작: ${new Date(benchmarkStats.roundStats.startTime).toISOString()}`);
    console.log(`   - 종료: ${new Date(benchmarkStats.roundStats.endTime).toISOString()}`);
    console.log(`   - 소요 시간: ${(benchmarkStats.roundStats.duration/1000).toFixed(2)}초`);
    
    console.log(`\n📋 사용자별 Agent 생성 현황:`);
    const agentCounts = Object.values(benchmarkStats.agentsPerUser);
    const countDistribution = {};
    agentCounts.forEach(count => {
        countDistribution[count] = (countDistribution[count] || 0) + 1;
    });
    
    Object.entries(countDistribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([count, users]) => {
        console.log(`   - ${count}개 Agent: ${users}명 (${(users/totalUsers*100).toFixed(1)}%)`);
    });
    
    console.log("=".repeat(50));

    console.log("\n🏁 벤치마크 01 완료!");
    console.log("📝 결과 요약:");
    console.log(`   - 평균 Agent 생성: ${(benchmarkStats.totalAgentsCreated / userAddresses.length).toFixed(2)}개/사용자`);
    console.log(`   - 하루 최대 50개 ItemParts 제한으로 인한 실제 Agent 생성률 분석 완료`);
}
// 스크립트 실행
main()
    .then(() => {
        console.log("\n🎯 벤치마크 01 실행 완료");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ 벤치마크 01 실행 실패:", error);
        process.exit(1);
    }); 