require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const hre = require("hardhat");
const { ethers } = hre;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 대기 함수
async function waitIfNeeded() {
    if(hre.network.name == 'localhost') {
        console.log("⏳ 다음 tx를 위해 1초 대기...");
        await sleep(1000);
    }
}

async function main() {
    console.log("🚀 TODL 컨트랙트 배포를 시작합니다... (OWNER_KEY 사용)");

    // OWNER_KEY 환경변수 확인
    const ownerKey = process.env.OWNER_KEY;
    if (!ownerKey) {
        throw new Error("❌ .env 파일에 OWNER_KEY를 설정해야 합니다.");
    }

    // 환경변수에서 주소 읽기 (없으면 에러)
    const admin = process.env.ADMIN_ADDRESS;
    const carrier = process.env.CARRIER_ADDRESS;
    const donateAddr = process.env.DONATE_ADDRESS;
    const corporateAddr = process.env.CORPORATE_ADDRESS;
    const operationAddr = process.env.OPERATION_ADDRESS;

    if (!admin || !carrier || !donateAddr || !corporateAddr || !operationAddr) {
        throw new Error("❌ .env 파일에 ADMIN_ADDRESS, CARRIER_ADDRESS, DONATE_ADDRESS, CORPORATE_ADDRESS, OPERATION_ADDRESS를 모두 설정해야 합니다.");
    }

    // OWNER_KEY로 지갑 생성
    const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL || "http://localhost:8545");
    const ownerWallet = new ethers.Wallet(ownerKey, provider);
    
    console.log("🌐 실행 네트워크:", hre.network.name);
    console.log("📋 배포 설정:");
    console.log("  - Owner Address:", ownerWallet.address);
    console.log("  - Admin:", admin);
    console.log("  - Carrier:", carrier);
    console.log("  - Donate Address:", donateAddr);
    console.log("  - Corporate Address:", corporateAddr);
    console.log("  - Operation Address:", operationAddr);

    try {
        // 1. STT 토큰 먼저 배포
        console.log("\n1️⃣ STT 토큰 배포 중...");
        const SttToken = await ethers.getContractFactory("SttPermit");
        const sttToken = await SttToken.connect(ownerWallet).deploy();
        await sttToken.waitForDeployment();
        const sttAddr = await sttToken.getAddress();
        console.log("✅ STT 토큰 배포 완료:", sttAddr);
        await waitIfNeeded();

        // 2. Main 컨트랙트 배포
        // console.log("\n2️⃣ Main 컨트랙트 배포 중...");
        // const Main = await ethers.getContractFactory("Main");
        console.log("\n2️⃣ MainMock 컨트랙트 배포 중...");
        const Main = await ethers.getContractFactory("MainMock"); // 당첨자 지정을 위해 Mock deploy (리얼버전에서는 반드시 빠져야 한다!)
        const main = await Main.connect(ownerWallet).deploy(
            [admin, carrier],
            donateAddr,
            corporateAddr,
            operationAddr
        );
        await main.waitForDeployment();
        const mainAddr = await main.getAddress();
        console.log("✅ Main 컨트랙트 배포 완료:", mainAddr);
        await waitIfNeeded();

        // 3. ItemParts 컨트랙트 배포
        console.log("\n3️⃣ ItemParts 컨트랙트 배포 중...");
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        const itemParts = await ItemParts.connect(ownerWallet).deploy(mainAddr);
        await itemParts.waitForDeployment();
        const itemPartsAddr = await itemParts.getAddress();
        console.log("✅ ItemParts 컨트랙트 배포 완료:", itemPartsAddr);
        await waitIfNeeded();

        // 4. Agent 컨트랙트 배포
        console.log("\n4️⃣ Agent 컨트랙트 배포 중...");
        const Agent = await ethers.getContractFactory("AgentNFT");
        const agent = await Agent.connect(ownerWallet).deploy(mainAddr);
        await agent.waitForDeployment();
        const agentAddr = await agent.getAddress();
        console.log("✅ Agent 컨트랙트 배포 완료:", agentAddr);
        await waitIfNeeded();

        // 5. Rng 컨트랙트 배포
        console.log("\n5️⃣ Rng 컨트랙트 배포 중...");
        const Rng = await ethers.getContractFactory("Rng");
        const rng = await Rng.connect(ownerWallet).deploy(mainAddr, admin);
        await rng.waitForDeployment();
        const rngAddr = await rng.getAddress();
        console.log("✅ Rng 컨트랙트 배포 완료:", rngAddr);
        await waitIfNeeded();

        // 6. RewardPool 컨트랙트 배포
        console.log("\n6️⃣ RewardPool 컨트랙트 배포 중...");
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const rewardPool = await RewardPool.connect(ownerWallet).deploy(mainAddr, sttAddr);
        await rewardPool.waitForDeployment();
        const rewardPoolAddr = await rewardPool.getAddress();
        console.log("✅ RewardPool 컨트랙트 배포 완료:", rewardPoolAddr);
        await waitIfNeeded();

        // 7. StakePool 컨트랙트 배포
        console.log("\n7️⃣ StakePool 컨트랙트 배포 중...");
        const StakePool = await ethers.getContractFactory("StakePool");
        const stakePool = await StakePool.connect(ownerWallet).deploy(sttAddr);
        await stakePool.waitForDeployment();
        const stakePoolAddr = await stakePool.getAddress();
        console.log("✅ StakePool 컨트랙트 배포 완료:", stakePoolAddr);
        await waitIfNeeded();

        // 8. Reserv 컨트랙트 배포
        console.log("\n8️⃣ Reserv 컨트랙트 배포 중...");
        const Reserv = await ethers.getContractFactory("Reserv");
        const reserv = await Reserv.connect(ownerWallet).deploy(sttAddr);
        await reserv.waitForDeployment();
        const reservAddr = await reserv.getAddress();
        console.log("✅ Reserv 컨트랙트 배포 완료:", reservAddr);
        await waitIfNeeded();

        // 9. Main 컨트랙트에 관리되는 컨트랙트들 설정
        console.log("\n9️⃣ Main 컨트랙트에 관리되는 컨트랙트들 설정 중...");
        const managedContracts = [
            itemPartsAddr,
            agentAddr,
            rngAddr,
            rewardPoolAddr,
            stakePoolAddr,
            reservAddr,
            sttAddr
        ];
        
        const setContractsTx = await main.connect(ownerWallet).setContracts(managedContracts);
        await setContractsTx.wait();
        console.log("✅ Main 컨트랙트에 관리되는 컨트랙트들 설정 완료");

        // 배포 결과 출력
        console.log("\n🎉 모든 컨트랙트 배포가 완료되었습니다!");
        console.log("\n📋 배포된 컨트랙트 주소들:");
        console.log("  - Main:", mainAddr);
        console.log("  - STT Token:", sttAddr);
        console.log("  - ItemParts:", itemPartsAddr);
        console.log("  - Agent:", agentAddr);
        console.log("  - Rng:", rngAddr);
        console.log("  - RewardPool:", rewardPoolAddr);
        console.log("  - StakePool:", stakePoolAddr);
        console.log("  - Reserv:", reservAddr);

        // 배포 정보를 파일로 저장
        const deploymentInfo = {
            network: await provider.getNetwork(),
            deployer: ownerWallet.address, // OWNER_KEY로 배포한 주소
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
            managedContracts: managedContracts,
            deploymentTime: new Date().toISOString(),
            deploymentBlock: await provider.getBlockNumber()
        };

        console.log("\n💾 배포 정보를 scripts/output/deployment-info.json 파일에 저장합니다...");
        const fs = require('fs');
        const path = require('path');
        
        // output 폴더가 없으면 생성
        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(
            path.join(outputDir, 'deployment-info.json'),
            JSON.stringify(deploymentInfo, null, 2)
        );
        console.log("✅ 배포 정보 저장 완료");

    } catch (error) {
        console.error("❌ 배포 중 오류가 발생했습니다:", error);
        process.exit(1);
    }
}

// 스크립트 실행
main()
    .then(() => {
        console.log("\n🎯 배포 스크립트 실행 완료 (OWNER_KEY 사용)");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ 배포 스크립트 실행 실패:", error);
        process.exit(1);
    }); 