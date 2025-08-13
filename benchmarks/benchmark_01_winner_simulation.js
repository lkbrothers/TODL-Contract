/**
 * @file benchmark_01_winner_simulation.js
 * @title Benchmark 01: 라운드 winner 시뮬레이션
 * @author hlibbc
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * @notice Global Variable 정의
 */
// 벤치마크 설정
const USER_COUNT = 10;
const ITEM_PARTS_MINT_PER_USER = 10;
const MAX_ITEM_PARTS_PER_ROUND = 50;

let users = [];
let userAddresses = [];

/**
 * @notice 대기 버퍼링 함수
 * @dev hardhat node 환경에서는 tx를 연달아 발행하면, 블록 갱신이 제대로 되지 않음 
 * 1초 정도 term이 필요함
 */
async function waitIfNeeded() {
    const providerUrl = process.env.PROVIDER_URL || '';
    if(providerUrl.includes('127.0.0.1') || providerUrl.includes('localhost')) {
        // console.log("⏳ 다음 tx를 위해 1초 대기...");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

/**
 * @notice EIP-712 표준에 따른 RNG 시그니처를 생성한다.
 * @param {*} adminWallet Admin 지갑
 * @param {*} rngAddress RNG 컨트랙트 주소
 * @param {*} roundId 라운드 ID
 * @param {*} randSeed 랜덤 시드
 * @returns EIP-712 시그니처
 */
async function createSignature(adminWallet, rngAddress, roundId, randSeed) {
    const rngDomain = {
        name: 'Custom-Rng',
        version: '1',
        chainId: await adminWallet.provider.getNetwork().then(n => n.chainId),
        verifyingContract: rngAddress
    };
    
    const rngTypes = {
        SigData: [
            { name: 'roundId', type: 'uint256' },
            { name: 'randSeed', type: 'uint256' }
        ]
    };
    
    const rngMessage = {
        roundId: roundId,
        randSeed: randSeed
    };
    
    const rngSignature = await adminWallet.signTypedData(rngDomain, rngTypes, rngMessage);
    return rngSignature;
}

/**
 * @notice 모든 컨트랙트를 배포하고 초기 설정을 완료합니다
 * @dev 순수 ethers.js를 사용하여 컨트랙트를 배포하고 Main 컨트랙트에 관리 컨트랙트들을 설정합니다
 * @dev 배포 정보를 benchmarks/deployment-info.json 파일에 저장합니다
 * @returns {Promise<Object>} 생성된 컨트랙트 객체들
 */
async function deployContracts() {
    console.log("\n📋 #### 컨트랙트 배포 및 초기 설정");
    
    let admin1, admin2;
    // 환경변수에서 주요 주소들 읽기
    const adminAddress = process.env.ADMIN_ADDRESS;
    const carrierAddress = process.env.CARRIER_ADDRESS;
    const donateAddress = process.env.DONATE_ADDRESS;
    const corporateAddress = process.env.CORPORATE_ADDRESS;
    const operationAddress = process.env.OPERATION_ADDRESS;
    
    if (!adminAddress || !carrierAddress || !donateAddress || !corporateAddress || !operationAddress) {
        throw new Error("❌ .env 파일에 ADMIN_ADDRESS, CARRIER_ADDRESS, DONATE_ADDRESS, CORPORATE_ADDRESS, OPERATION_ADDRESS를 모두 설정해야 합니다.");
    }
    // 주요 계정들을 환경변수 주소로 설정
    admin1 = { address: adminAddress };
    admin2 = { address: carrierAddress };

    // 컨트랙트 배포 - 순수 ethers 방식 사용
    console.log("....컨트랙트 ABI/Bytecode 파일 읽기 중...");
    
    // ABI/Bytecode 파일들 읽기
    const mainArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Main.sol/Main.json'), 'utf8'));
    const sttPermitArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/SttPermit.sol/SttPermit.json'), 'utf8'));
    const itemPartsArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json'), 'utf8'));
    const agentArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Agent.sol/AgentNFT.json'), 'utf8'));
    const rewardPoolArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/RewardPool.sol/RewardPool.json'), 'utf8'));
    const rngArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Rng.sol/Rng.json'), 'utf8'));
    const stakePoolArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/StakePool.sol/StakePool.json'), 'utf8'));
    const reservArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Reserv.sol/Reserv.json'), 'utf8'));
    
    console.log("   ✅ ABI/Bytecode 파일 읽기 완료");
    
    // Main 컨트랙트 배포
    console.log("👥 Main 컨트랙트 배포 중...");
    const Main = new ethers.ContractFactory(mainArtifact.abi, mainArtifact.bytecode, ownerWallet);
    const main = await Main.deploy(
        [admin1.address, admin2.address], 
        donateAddress,
        corporateAddress,
        operationAddress
    );
    await main.waitForDeployment();
    await waitIfNeeded();
    const mainAddr = await main.getAddress();

    
    // STT 토큰 배포
    console.log("👥 STT 컨트랙트 배포 중...");
    const SttToken = new ethers.ContractFactory(sttPermitArtifact.abi, sttPermitArtifact.bytecode, ownerWallet);
    const stt = await SttToken.deploy();
    await stt.waitForDeployment();
    await waitIfNeeded();
    const sttAddr = await stt.getAddress();

    // 다른 컨트랙트들 배포
    console.log("👥 ItemParts 컨트랙트 배포 중...");
    const ItemParts = new ethers.ContractFactory(itemPartsArtifact.abi, itemPartsArtifact.bytecode, ownerWallet);
    const itemParts = await ItemParts.deploy(mainAddr);
    await itemParts.waitForDeployment();
    await waitIfNeeded();
    const itemPartsAddr = await itemParts.getAddress();

    console.log("👥 Agent 컨트랙트 배포 중...");
    const Agent = new ethers.ContractFactory(agentArtifact.abi, agentArtifact.bytecode, ownerWallet);
    const agent = await Agent.connect(ownerWallet).deploy(mainAddr);
    await agent.waitForDeployment();
    await waitIfNeeded();
    const agentAddr = await agent.getAddress();

    console.log("👥 RewardPool 컨트랙트 배포 중...");
    const RewardPool = new ethers.ContractFactory(rewardPoolArtifact.abi, rewardPoolArtifact.bytecode, ownerWallet);
    const rewardPool = await RewardPool.deploy(mainAddr, sttAddr);
    await rewardPool.waitForDeployment();
    await waitIfNeeded();
    const rewardPoolAddr = await rewardPool.getAddress();

    console.log("👥 Rng 컨트랙트 배포 중...");
    const Rng = new ethers.ContractFactory(rngArtifact.abi, rngArtifact.bytecode, ownerWallet);
    const rng = await Rng.deploy(mainAddr, admin1.address);
    await rng.waitForDeployment();
    await waitIfNeeded();
    const rngAddr = await rng.getAddress();

    console.log("👥 StakePool 컨트랙트 배포 중...");
    const StakePool = new ethers.ContractFactory(stakePoolArtifact.abi, stakePoolArtifact.bytecode, ownerWallet);
    const stakePool = await StakePool.deploy(sttAddr);
    await stakePool.waitForDeployment();
    await waitIfNeeded();
    const stakePoolAddr = await stakePool.getAddress();

    console.log("👥 Reserv 컨트랙트 배포 중...");
    const Reserv = new ethers.ContractFactory(reservArtifact.abi, reservArtifact.bytecode, ownerWallet);
    const reserv = await Reserv.deploy(sttAddr);
    await reserv.waitForDeployment();
    await waitIfNeeded();
    const reservAddr = await reserv.getAddress();
        
    // Main 컨트랙트에 관리 컨트랙트들 설정
    console.log("🌐 Main 컨트랙트에 관리되는 컨트랙트들 설정 중...");
    await main.setContracts([
        itemPartsAddr,
        agentAddr,
        rngAddr,
        rewardPoolAddr,
        stakePoolAddr,
        reservAddr,
        sttAddr
    ]);
    await waitIfNeeded();
    
    console.log("✅ 컨트랙트 배포 완료");
    console.log(`   - Main: ${mainAddr}`);
    console.log(`   - ItemParts: ${itemPartsAddr}`);
    console.log(`   - Agent: ${agentAddr}`);
    console.log(`   - RewardPool: ${rewardPoolAddr}`);
    console.log(`   - STT: ${sttAddr}`);
    console.log(`   - Rng: ${rngAddr}`);
    console.log(`   - StakePool: ${stakePoolAddr}`);
    console.log(`   - Reserv: ${reservAddr}`);

    // 배포 정보를 JSON 파일에 저장
    const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL || "http://localhost:8545");
    const network = await provider.getNetwork();
    const latestBlock = await provider.getBlock('latest');
    
    const deploymentInfo = {
        network: {
            name: network.name,
            chainId: network.chainId.toString()
        },
        deployer: ownerWallet.address,
        contracts: {
            main: mainAddr,
            sttToken: sttAddr,
            itemParts: itemPartsAddr,
            agent: agentAddr,
            rng: rngAddr,
            rewardPool: rewardPoolAddr,
            stakePool: stakePoolAddr,
            reserv: reservAddr
        },
        managedContracts: [
            itemPartsAddr,
            agentAddr,
            rngAddr,
            rewardPoolAddr,
            stakePoolAddr,
            reservAddr,
            sttAddr
        ],
        deploymentTime: new Date().toISOString(),
        deploymentBlock: latestBlock.number
    };

    // benchmarks 디렉토리가 없으면 생성
    const benchmarksDir = path.join(__dirname, 'deployment-info.json');
    fs.writeFileSync(benchmarksDir, JSON.stringify(deploymentInfo, null, 2));
    console.log(`📄 배포 정보 저장 완료: ${benchmarksDir}`);
}

/**
 * @notice 기존 배포 정보에서 컨트랙트 객체들을 생성합니다
 * @dev benchmarks/deployment-info.json 파일에서 컨트랙트 주소들을 읽어와서 컨트랙트 객체를 생성합니다
 * @returns {Promise<Object|null>} 생성된 컨트랙트 객체들 또는 null (기존 배포 정보가 없는 경우)
 */
async function importContracts() {
    try {
        console.log("📄 기존 배포 정보에서 컨트랙트 주소 읽기 중...");
        const deploymentInfoPath = path.join(__dirname, 'deployment-info.json');
        
        if (fs.existsSync(deploymentInfoPath)) {
            const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
            console.log("✅ 기존 배포 정보 발견");
            
            const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL || "http://localhost:8545");
            
            // ABI/Bytecode 파일들 읽기
            const mainArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Main.sol/Main.json'), 'utf8'));
            const sttPermitArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/SttPermit.sol/SttPermit.json'), 'utf8'));
            const itemPartsArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/ItemParts.sol/ItemPartsNFT.json'), 'utf8'));
            const agentArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Agent.sol/AgentNFT.json'), 'utf8'));
            const rewardPoolArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/RewardPool.sol/RewardPool.json'), 'utf8'));
            const rngArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Rng.sol/Rng.json'), 'utf8'));
            const stakePoolArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/StakePool.sol/StakePool.json'), 'utf8'));
            const reservArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/contracts/Reserv.sol/Reserv.json'), 'utf8'));
            
            // 컨트랙트 객체 생성
            const main = new ethers.Contract(deploymentInfo.contracts.main, mainArtifact.abi, provider);
            const stt = new ethers.Contract(deploymentInfo.contracts.sttToken, sttPermitArtifact.abi, provider);
            const itemParts = new ethers.Contract(deploymentInfo.contracts.itemParts, itemPartsArtifact.abi, provider);
            const agent = new ethers.Contract(deploymentInfo.contracts.agent, agentArtifact.abi, provider);
            const rewardPool = new ethers.Contract(deploymentInfo.contracts.rewardPool, rewardPoolArtifact.abi, provider);
            const rng = new ethers.Contract(deploymentInfo.contracts.rng, rngArtifact.abi, provider);
            const stakePool = new ethers.Contract(deploymentInfo.contracts.stakePool, stakePoolArtifact.abi, provider);
            const reserv = new ethers.Contract(deploymentInfo.contracts.reserv, reservArtifact.abi, provider);
            
            console.log("✅ 기존 컨트랙트 객체 생성 완료");
            console.log(`   - Main: ${deploymentInfo.contracts.main}`);
            console.log(`   - ItemParts: ${deploymentInfo.contracts.itemParts}`);
            console.log(`   - Agent: ${deploymentInfo.contracts.agent}`);
            console.log(`   - RewardPool: ${deploymentInfo.contracts.rewardPool}`);
            console.log(`   - STT: ${deploymentInfo.contracts.sttToken}`);
            console.log(`   - Rng: ${deploymentInfo.contracts.rng}`);
            console.log(`   - StakePool: ${deploymentInfo.contracts.stakePool}`);
            console.log(`   - Reserv: ${deploymentInfo.contracts.reserv}`);
            
            // 기존 배포 정보가 있으면 새로 배포하지 않고 기존 컨트랙트 사용
            console.log("🔄 기존 배포된 컨트랙트 사용");
            
            return {
                main,
                stt,
                itemParts,
                agent,
                rewardPool,
                rng,
                stakePool,
                reserv
            };
        } else {
            console.log("📄 기존 배포 정보 없음 - 새로 배포 진행");
            return null;
        }
    } catch (error) {
        console.log(`⚠️ 기존 배포 정보 읽기 실패: ${error.message}`);
        console.log("🔄 새로 배포 진행");
        return null;
    }
}

/**
 * @notice 사용자 계정들을 생성하고 account.json 파일에 저장합니다
 * @dev 지정된 수만큼 랜덤 지갑을 생성하고 privateKey와 함께 저장합니다
 * @param {number} count - 생성할 계정 수
 * @returns {Promise<void>}
 */
async function createAccounts(count) {
    users = [];
    userAddresses = [];

    for (let i = 0; i < count; i++) {
        // private key 없이 지갑 생성 (더 빠름)
        const wallet = ethers.Wallet.createRandom();
        
        users.push({
            address: wallet.address,
            privateKey: wallet.privateKey,
            wallet: wallet
        });
        userAddresses.push(wallet.address);
    }

    // 생성된 계정 정보를 JSON 파일에 저장
    const accountInfo = {
        users: users.map(user => ({
            address: user.address,
            privateKey: user.privateKey
        })),
        totalCount: users.length,
        createdAt: new Date().toISOString()
    };

    const accountFilePath = path.join(__dirname, 'account.json');
    fs.writeFileSync(accountFilePath, JSON.stringify(accountInfo, null, 2));
    console.log(`📄 계정 정보 저장 완료: ${accountFilePath}`);
    console.log(`👥 ${count}개의 계정 생성 완료`);
}

/**
 * @notice 모든 사용자에게 초기 자금(ETH, STT)을 지급합니다
 * @dev 각 사용자에게 1 ETH와 10 STT를 전송합니다
 * @param {string[]} userAddresses - 자금을 받을 사용자 주소 배열
 * @param {ethers.Wallet} ownerWallet - 자금을 지급할 owner 지갑
 * @param {ethers.Contract} stt - STT 토큰 컨트랙트 인스턴스
 * @returns {Promise<void>}
 */
async function chargeCoins(userAddresses, ownerWallet, stt) {
    console.log("\n💰 2단계: 사용자들에게 초기 자금 지급");

    const ethAmount = ethers.parseEther("1");
    const sttAmount = ethers.parseEther("10");
    
    for (let i = 0; i < userAddresses.length; i++) {
        // ETH 전송 (owner가 실제 signer여야 함)
        await ownerWallet.sendTransaction({
            to: userAddresses[i],
            value: ethAmount
        });
        await waitIfNeeded();
        await stt.connect(ownerWallet).transfer(userAddresses[i], sttAmount);
        await waitIfNeeded();
        
        if (i != 0 && i % 10 === 0) {
            console.log(`   진행률: ${i}/${userAddresses.length} 사용자 처리 완료`);
        }
    }
    
    console.log("✅ 모든 사용자에게 초기 자금 지급 완료");
    console.log(`   - ETH: 1 ETH씩 ${userAddresses.length}명`);
    console.log(`   - STT: 10 STT씩 ${userAddresses.length}명`);
}

/**
 * @notice account.json 파일에서 기존 계정 정보를 읽어와서 wallet 객체들을 생성합니다
 * @dev account.json 파일의 privateKey를 사용하여 ethers.Wallet 객체를 생성하고 전역변수에 저장합니다
 * @returns {Promise<boolean>} 성공 시 true, 실패 시 false
 */
async function importUserWallets() {
    try {
        console.log("📄 기존 계정 정보 읽기 중...");
        const accountFilePath = path.join(__dirname, 'account.json');
        
        if (fs.existsSync(accountFilePath)) {
            const accountInfo = JSON.parse(fs.readFileSync(accountFilePath, 'utf8'));
            console.log("✅ 기존 계정 정보 발견");
            console.log(`👥 총 ${accountInfo.totalCount}개의 계정 로드`);
            
            // 각 계정의 privateKey로 wallet object 생성
            users = [];
            userAddresses = [];
            
            for (let i = 0; i < accountInfo.users.length; i++) {
                const userData = accountInfo.users[i];
                const wallet = new ethers.Wallet(userData.privateKey);
                
                users.push({
                    address: userData.address,
                    privateKey: userData.privateKey,
                    wallet: wallet
                });
                userAddresses.push(userData.address);
            }
            
            console.log("✅ 기존 계정 wallet 객체 생성 완료");
            console.log(`   - 로드된 계정 수: ${users.length}개`);
            console.log(`   - 첫 번째 계정: ${users[0]?.address || 'N/A'}`);
            console.log(`   - 마지막 계정: ${users[users.length - 1]?.address || 'N/A'}`);
            
            return true;
        } else {
            console.log("📄 기존 계정 정보 없음 - 새로 생성 필요");
            return false;
        }
    } catch (error) {
        console.log(`⚠️ 기존 계정 정보 읽기 실패: ${error.message}`);
        console.log("🔄 새로 계정 생성 진행");
        return false;
    }
}

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
    
    // exec-opts/benchmark_01.json 파일 읽기
    try {
        console.log("📄 벤치마크 설정 파일 읽기 중...");
        const benchmarkConfigPath = path.join(__dirname, './exec-opts/benchmark_01.json');
        
        if (fs.existsSync(benchmarkConfigPath)) {
            const benchmarkConfig = JSON.parse(fs.readFileSync(benchmarkConfigPath, 'utf8'));
            console.log("✅ 벤치마크 설정 파일 발견");
            
            // 구조체 정의
            const BenchmarkConfig = {
                contractOpt: {
                    flag: benchmarkConfig.contractOpt?.flag || false
                },
                accountOpt: {
                    flag: benchmarkConfig.accountOpt?.flag || false,
                    count: benchmarkConfig.accountOpt?.count || 10
                },
                chargeOpt: {
                    flag: benchmarkConfig.chargeOpt?.flag || false,
                    amountEth: benchmarkConfig.chargeOpt?.amountEth || 1,
                    amountStt: benchmarkConfig.chargeOpt?.amountStt || 10
                }
            };
            
            console.log("📊 벤치마크 설정:");
            console.log(`   📋 ContractOpt:`);
            console.log(`      - flag: ${BenchmarkConfig.contractOpt.flag}`);
            console.log(`   👥 AccountOpt:`);
            console.log(`      - flag: ${BenchmarkConfig.accountOpt.flag}`);
            console.log(`      - count: ${BenchmarkConfig.accountOpt.count}`);
            console.log(`   💰 ChargeOpt:`);
            console.log(`      - flag: ${BenchmarkConfig.chargeOpt.flag}`);
            console.log(`      - amountEth: ${BenchmarkConfig.chargeOpt.amountEth} ETH`);
            console.log(`      - amountStt: ${BenchmarkConfig.chargeOpt.amountStt} STT`);

            ///// jhhong
            // BenchmarkConfig.contractOpt.flag 값에 따라 컨트랙트 배포 또는 임포트
            if (BenchmarkConfig.contractOpt.flag) {
                console.log("🔄 새로 컨트랙트 배포 진행");
                await deployContracts();
            }
            console.log("📄 배포 정보(deployment-info.json)에서 컨트랙트 임포트 시도");
            let deployedContracts = await importContracts();
            
            // 반환된 컨트랙트 객체들을 변수에 저장
            main = deployedContracts.main;
            stt = deployedContracts.stt;
            itemParts = deployedContracts.itemParts;
            agent = deployedContracts.agent;
            rewardPool = deployedContracts.rewardPool;
            rng = deployedContracts.rng;
            stakePool = deployedContracts.stakePool;
            reserv = deployedContracts.reserv;
            
            console.log("✅ 컨트랙트 객체 설정 완료");

            // 계정 생성 및 초기 자금 지급
            if (BenchmarkConfig.accountOpt.flag) {
                console.log("🔄 계정 생성 및 초기 자금 지급 진행");
                await createAccounts(BenchmarkConfig.accountOpt.count);
            }

            // account.json 파일에서 기존 계정 정보 읽기
            const walletsImported = await importUserWallets();
            if (!walletsImported) {
                console.log("📄 기존 계정 정보 없음 - 새로 생성 필요");
                // 계정 생성이 필요한 경우 여기서 처리
            }

            // 초기 자금 지급
            if (BenchmarkConfig.chargeOpt.flag) {
                console.log("💰 초기 자금 지급 진행");
                await chargeCoins(userAddresses, ownerWallet, stt);
            }
        } else {
            throw new Error("❌ 벤치마크 설정 파일이 없습니다: benchmarks/exec-opts/benchmark_01.json");
        }
    } catch (error) {
        if (error.message.includes("벤치마크 설정 파일이 없습니다")) {
            throw error;
        } else {
            console.log(`⚠️ 벤치마크 설정 파일 읽기 실패: ${error.message}`);
            throw new Error("❌ 벤치마크 설정 파일을 읽을 수 없습니다: benchmarks/exec-opts/benchmark_01.json");
        }
    }
    
    // // 기존 배포 정보에서 컨트랙트 객체 생성 시도
    // const importedContracts = await importContracts();
    // if (importedContracts) {
    //     // 기존 컨트랙트 사용
    //     main = importedContracts.main;
    //     stt = importedContracts.stt;
    //     itemParts = importedContracts.itemParts;
    //     agent = importedContracts.agent;
    //     rewardPool = importedContracts.rewardPool;
    //     rng = importedContracts.rng;
    //     stakePool = importedContracts.stakePool;
    //     reserv = importedContracts.reserv;
    // } else {
    //     // 새로 배포 진행
    //     await deployContracts();
    // }
    
    // // 통계 데이터
    // let benchmarkStats = {
    //     totalItemPartsMinted: 0,
    //     totalAgentsCreated: 0,
    //     agentsPerUser: {},
    //     partsDistribution: {
    //         Head: 0,
    //         Body: 0,
    //         Legs: 0,
    //         RHand: 0,
    //         LHand: 0
    //     },
    //     roundStats: {
    //         roundId: 0,
    //         startTime: 0,
    //         endTime: 0,
    //         duration: 0
    //     }
    // };

    // console.log("🚀 벤치마크 01 시작: 라운드 시뮬레이션");
    // console.log(`📊 설정: ${USER_COUNT}명의 사용자, 사용자당 ${MAX_ITEM_PARTS_PER_ROUND}개 ItemParts 민팅`);
    
    // const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL || "http://localhost:8545");
    
    // const ownerKey = process.env.OWNER_KEY;
    // if  (!ownerKey) {
    //     throw new Error("❌ .env 파일에 OWNER_KEY를 설정해야 합니다.");
    // }
    // const ownerWallet = new ethers.Wallet(ownerKey, provider);
    // const adminKey = process.env.ADMIN_KEY;
    // if  (!adminKey) {
    //     throw new Error("❌ .env 파일에 ADMIN_KEY를 설정해야 합니다.");
    // }
    // const adminWallet = new ethers.Wallet(adminKey, provider);
    
    
    
    
    
    // console.log(`👥 주요 계정 설정 완료:`);
    // console.log(`   - Owner: ${ownerWallet.address}`);
    // console.log(`   - Admin1: ${admin1.address}`);
    // console.log(`   - Admin2: ${admin2.address}`);
    // console.log(`   - 사용자 ${userAddresses.length}명 생성 완료`);

    // await createAccounts(); // 계정 생성은 기존 배포 정보에서 컨트랙트 객체를 사용하는 경우에도 필요

    // await chargeCoins(userAddresses, ownerWallet, stt);

    // console.log("\n🎯 3단계: 라운드 시작");
        
    // // 라운드 시작 (admin1이 실제 signer여야 함)
    // const currentRoundId = await main.roundId();
    // const roundId = currentRoundId + 1n;
    // const buf = crypto.randomBytes(32);
    // const hexStr = '0x' + buf.toString('hex');
    // const randSeed = hexStr;

    // const signature = await createSignature(adminWallet, rng.address, roundId, randSeed);
    
    // const startRoundTx = await main.connect(adminWallet).startRound(signature, {
    //     gasLimit: 300000
    // });
    // const receipt = await startRoundTx.wait();
    // await waitIfNeeded();
    
    // // Gas 사용량 출력
    // console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${startRoundTx.gasLimit.toString()}`);
    // console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);

    // benchmarkStats.roundStats.roundId = Number(roundId);
    // benchmarkStats.roundStats.startTime = Date.now();
    
    // console.log(`✅ 라운드 ${roundId} 시작 완료`);
    // console.log(`   - 시작 시간: ${new Date().toISOString()}`);

    // console.log("\n🎨 4단계: ItemParts 민팅 및 Agent 구매");
        
    // for (let userIndex = 0; userIndex < userAddresses.length; userIndex++) {
    //     const user = users[userIndex];
    //     const userAddress = userAddresses[userIndex];
        
    //     console.log(`\n👤 사용자 ${userIndex + 1}/${userAddresses.length} 처리 중...`);
        
    //     // 사용자별 Agent 생성 개수 초기화
    //     benchmarkStats.agentsPerUser[userAddress] = 0;
        
    //     // ItemParts 민팅 (최대 10회)
    //     const mintedParts = {
    //         Head: [],
    //         Body: [],
    //         Legs: [],
    //         RHand: [],
    //         LHand: []
    //     };
        
    //     for (let mintCount = 0; mintCount < ITEM_PARTS_MINT_PER_USER; mintCount++) {
    //         try {
    //             // ItemParts 민팅 (사용자 wallet로 서명)
    //             const userWallet = new ethers.Wallet(user.privateKey, provider);
    //             const mintTx = await itemParts.connect(userWallet).mint({
    //                 gasLimit: 1500000 // 약 150만 gas limit 설정
    //             });
    //             const receipt = await mintTx.wait();
    //             await waitIfNeeded();
    //             console.log(`   ✅ ItemParts 민팅 성공`);
                
    //             // 민팅된 NFT ID 추출
    //             const event = receipt.logs.find(log => 
    //                 log.fragment && log.fragment.name === 'Transfer'
    //             );
                
    //             if (event) {
    //                 const tokenId = event.args[2];
    //                 const tokenInfo = await itemParts.tokenInfo(tokenId);
    //                 const partsId = tokenInfo[0];
                    
    //                 // 부위별로 분류
    //                 const partsNames = ['Head', 'Body', 'Legs', 'RHand', 'LHand'];
    //                 const partsName = partsNames[partsId];
    //                 mintedParts[partsName].push(tokenId);
                    
    //                 benchmarkStats.partsDistribution[partsName]++;
    //                 benchmarkStats.totalItemPartsMinted++;
    //             }
                
    //         } catch (error) {
    //             console.log(`   ⚠️  사용자 ${userIndex + 1}의 ${mintCount + 1}번째 민팅 실패: ${error.message}`);
    //             break; // 민팅 실패 시 중단
    //         }
    //     }
        
    //     // 부위별 배열에서 가장 짧은 부위 찾기
    //     const partsLengths = Object.values(mintedParts).map(parts => parts.length);
    //     const minLength = Math.min(...partsLengths);
        
    //     console.log(`   📦 민팅된 파츠: ${JSON.stringify(mintedParts, (key, value) => 
    //         typeof value === 'bigint' ? value.toString() : value
    //     )}`);
    //     console.log(`   📏 최소 부위 길이: ${minLength}`);
        
    //     // 최소 길이만큼 Agent 구매 시도
    //     for (let agentIndex = 0; agentIndex < minLength; agentIndex++) {
    //         try {
    //             // 각 부위에서 하나씩 선택
    //             const itemPartsIds = [
    //                 mintedParts.Head[agentIndex],
    //                 mintedParts.Body[agentIndex],
    //                 mintedParts.Legs[agentIndex],
    //                 mintedParts.RHand[agentIndex],
    //                 mintedParts.LHand[agentIndex]
    //             ];
                
    //             console.log(`   📍 Agent ${agentIndex + 1} 구매 시도:`, itemPartsIds);
                
    //             // ItemParts 부위 정보 확인
    //             for (let i = 0; i < itemPartsIds.length; i++) {
    //                 try {
    //                     const tokenInfo = await itemParts.tokenInfo(itemPartsIds[i]);
    //                     console.log(`   📍 ItemParts ${itemPartsIds[i]} 부위: ${tokenInfo[0]}`);
    //                 } catch (error) {
    //                     console.log(`   ❌ ItemParts ${itemPartsIds[i]} 정보 조회 실패: ${error.message}`);
    //                 }
    //             }
                
    //             // STT 승인
    //             const sttAmount = ethers.parseEther("1");
    //             const userWallet = new ethers.Wallet(user.privateKey, provider);
                
    //             // Permit 서명 생성
    //             const deadline = Math.floor(Date.now() / 1000) + 3600;
    //             const domain = {
    //                 name: await stt.name(),
    //                 version: '1',
    //                 chainId: await provider.getNetwork().then(n => n.chainId),
    //                 verifyingContract: await stt.getAddress()
    //             };
                
    //             const types = {
    //                 Permit: [
    //                     { name: 'owner', type: 'address' },
    //                     { name: 'spender', type: 'address' },
    //                     { name: 'value', type: 'uint256' },
    //                     { name: 'nonce', type: 'uint256' },
    //                     { name: 'deadline', type: 'uint256' }
    //                 ]
    //             };
                
    //             const nonce = await stt.nonces(userAddress);
    //             const value = sttAmount;
    //             console.log(`   📍 permit nonce: ${nonce}`);
    //             console.log(`   📍 permit value: ${ethers.formatEther(value)} STT`);
                
    //             const signature = await userWallet.signTypedData(domain, types, {
    //                 owner: userAddress,
    //                 spender: rewardPool.address,
    //                 value: value,
    //                 nonce: nonce,
    //                 deadline: deadline
    //             });
            
    //             // Agent 구매
    //             console.log(`   📍 STT 잔액 확인: ${ethers.formatEther(await stt.balanceOf(userAddress))} STT`);
    //             console.log(`   📍 필요 STT 양: ${ethers.formatEther(sttAmount)} STT`);
    //             console.log(`   📍 permit deadline: ${deadline}`);
    //             console.log(`   📍 permit signature 길이: ${signature.length}`);
                
    //             const buyAgentTx = await main.connect(userWallet).buyAgent(itemPartsIds, deadline, signature, {
    //                 gasLimit: 1500000
    //             });
    //             await buyAgentTx.wait();
    //             await waitIfNeeded();
                
    //             benchmarkStats.agentsPerUser[userAddress]++;
    //             benchmarkStats.totalAgentsCreated++;
                
    //             console.log(`   ✅ Agent ${agentIndex + 1} 구매 성공`);
                
    //         } catch (error) {
    //             console.log(`   ❌ Agent ${agentIndex + 1} 구매 실패: ${error.message}`);
    //             break; // Agent 구매 실패 시 중단
    //         }
    //     }
        
    //     console.log(`   📊 사용자 ${userIndex + 1} 결과: ${benchmarkStats.agentsPerUser[userAddress]}개 Agent 생성`);
    // }

    // console.log("\n🔒 4단계: 라운드 종료");
    // console.log("=".repeat(50));
    
    // try {
    //     // 1. closeTicketRound 호출
    //     console.log("   🔒 closeTicketRound 호출 중...");
    //     const user = users[0];
    //     const userWallet = new ethers.Wallet(user.privateKey, provider);
    //     const closeTicketTx = await main.connect(userWallet).closeTicketRound({
    //         gasLimit: 300000
    //     });
    //     await closeTicketTx.wait();
    //     await waitIfNeeded();
    //     console.log("   ✅ closeTicketRound 성공");
        
    //     // 2. settleRound 호출 (랜덤 시드 필요)
    //     console.log("   🎲 settleRound 호출 중...");
    //     const settleRoundTx = await main.connect(adminWallet).settleRound(randSeed, {
    //         gasLimit: 1500000
    //     });
    //     await settleRoundTx.wait();
    //     await waitIfNeeded();
    //     console.log("   ✅ settleRound 성공");
        
    //     console.log("   🎉 라운드 정상 종료 완료!");
        
    // } catch (error) {
    //     console.log(`   ❌ 라운드 종료 실패: ${error.message}`);
    //     throw error;
    // }

    // console.log("\n📊 5단계: 벤치마크 결과 분석");
        
    // benchmarkStats.roundStats.endTime = Date.now();
    // benchmarkStats.roundStats.duration = benchmarkStats.roundStats.endTime - benchmarkStats.roundStats.startTime;
    
    // // 통계 계산
    // const totalUsers = userAddresses.length;
    // const successfulUsers = Object.values(benchmarkStats.agentsPerUser).filter(count => count > 0).length;
    // const averageAgentsPerUser = benchmarkStats.totalAgentsCreated / totalUsers;
    // const maxAgentsPerUser = Math.max(...Object.values(benchmarkStats.agentsPerUser));
    // const minAgentsPerUser = Math.min(...Object.values(benchmarkStats.agentsPerUser));
    
    // console.log("\n🎯 벤치마크 결과:");
    // console.log("=".repeat(50));
    // console.log(`📈 전체 통계:`);
    // console.log(`   - 총 사용자 수: ${totalUsers}명`);
    // console.log(`   - Agent 생성 성공 사용자: ${successfulUsers}명 (${(successfulUsers/totalUsers*100).toFixed(1)}%)`);
    // console.log(`   - 총 ItemParts 민팅: ${benchmarkStats.totalItemPartsMinted}개`);
    // console.log(`   - 총 Agent 생성: ${benchmarkStats.totalAgentsCreated}개`);
    // console.log(`   - 평균 Agent/사용자: ${averageAgentsPerUser.toFixed(2)}개`);
    // console.log(`   - 최대 Agent/사용자: ${maxAgentsPerUser}개`);
    // console.log(`   - 최소 Agent/사용자: ${minAgentsPerUser}개`);
    
    // console.log(`\n🎨 파츠 분포:`);
    // Object.entries(benchmarkStats.partsDistribution).forEach(([part, count]) => {
    //     console.log(`   - ${part}: ${count}개 (${(count/benchmarkStats.totalItemPartsMinted*100).toFixed(1)}%)`);
    // });
    
    // console.log(`\n⏱️  실행 시간:`);
    // console.log(`   - 시작: ${new Date(benchmarkStats.roundStats.startTime).toISOString()}`);
    // console.log(`   - 종료: ${new Date(benchmarkStats.roundStats.endTime).toISOString()}`);
    // console.log(`   - 소요 시간: ${(benchmarkStats.roundStats.duration/1000).toFixed(2)}초`);
    
    // console.log(`\n📋 사용자별 Agent 생성 현황:`);
    // const agentCounts = Object.values(benchmarkStats.agentsPerUser);
    // const countDistribution = {};
    // agentCounts.forEach(count => {
    //     countDistribution[count] = (countDistribution[count] || 0) + 1;
    // });
    
    // Object.entries(countDistribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([count, users]) => {
    //     console.log(`   - ${count}개 Agent: ${users}명 (${(users/totalUsers*100).toFixed(1)}%)`);
    // });
    
    // console.log("=".repeat(50));

    // console.log("\n🏁 벤치마크 01 완료!");
    // console.log("📝 결과 요약:");
    // console.log(`   - 평균 Agent 생성: ${(benchmarkStats.totalAgentsCreated / userAddresses.length).toFixed(2)}개/사용자`);
    // console.log(`   - 하루 최대 50개 ItemParts 제한으로 인한 실제 Agent 생성률 분석 완료`);
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