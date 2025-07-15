require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 TODL 컨트랙트 배포를 시작합니다...");

    // 환경변수에서 주소 읽기 (없으면 에러)
    const admin = process.env.ADMIN_ADDRESS;
    const carrier = process.env.CARRIER_ADDRESS;
    const donateAddr = process.env.DONATE_ADDRESS;
    const corporateAddr = process.env.CORPORATE_ADDRESS;
    const operationAddr = process.env.OPERATION_ADDRESS;

    if (!admin || !carrier || !donateAddr || !corporateAddr || !operationAddr) {
        throw new Error("❌ .env 파일에 ADMIN_ADDRESS, CARRIER_ADDRESS, DONATE_ADDRESS, CORPORATE_ADDRESS, OPERATION_ADDRESS를 모두 설정해야 합니다.");
    }

    console.log("📋 배포 설정:");
    console.log("  - Admin:", admin);
    console.log("  - Carrier:", carrier);
    console.log("  - Donate Address:", donateAddr);
    console.log("  - Corporate Address:", corporateAddr);
    console.log("  - Operation Address:", operationAddr);

    try {
        // 1. STT 토큰 먼저 배포
        console.log("\n1️⃣ STT 토큰 배포 중...");
        const SttToken = await ethers.getContractFactory("SttPermit");
        const sttToken = await SttToken.deploy();
        await sttToken.waitForDeployment();
        const sttAddr = await sttToken.getAddress();
        console.log("✅ STT 토큰 배포 완료:", sttAddr);

        // 2. Main 컨트랙트 배포
        console.log("\n2️⃣ Main 컨트랙트 배포 중...");
        const Main = await ethers.getContractFactory("Main");
        const main = await Main.deploy(
            [admin, carrier],
            donateAddr,
            corporateAddr,
            operationAddr
        );
        await main.waitForDeployment();
        const mainAddr = await main.getAddress();
        console.log("✅ Main 컨트랙트 배포 완료:", mainAddr);

        // 3. ItemParts 컨트랙트 배포
        console.log("\n3️⃣ ItemParts 컨트랙트 배포 중...");
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        const itemParts = await ItemParts.deploy(mainAddr);
        await itemParts.waitForDeployment();
        const itemPartsAddr = await itemParts.getAddress();
        console.log("✅ ItemParts 컨트랙트 배포 완료:", itemPartsAddr);

        // 4. Agent 컨트랙트 배포
        console.log("\n4️⃣ Agent 컨트랙트 배포 중...");
        const Agent = await ethers.getContractFactory("AgentNFT");
        const agent = await Agent.deploy(mainAddr);
        await agent.waitForDeployment();
        const agentAddr = await agent.getAddress();
        console.log("✅ Agent 컨트랙트 배포 완료:", agentAddr);

        // 5. Rng 컨트랙트 배포
        console.log("\n5️⃣ Rng 컨트랙트 배포 중...");
        const Rng = await ethers.getContractFactory("Rng");
        const rng = await Rng.deploy(mainAddr, admin);
        await rng.waitForDeployment();
        const rngAddr = await rng.getAddress();
        console.log("✅ Rng 컨트랙트 배포 완료:", rngAddr);

        // 6. RewardPool 컨트랙트 배포
        console.log("\n6️⃣ RewardPool 컨트랙트 배포 중...");
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const rewardPool = await RewardPool.deploy(mainAddr, sttAddr);
        await rewardPool.waitForDeployment();
        const rewardPoolAddr = await rewardPool.getAddress();
        console.log("✅ RewardPool 컨트랙트 배포 완료:", rewardPoolAddr);

        // 7. StakePool 컨트랙트 배포
        console.log("\n7️⃣ StakePool 컨트랙트 배포 중...");
        const StakePool = await ethers.getContractFactory("StakePool");
        const stakePool = await StakePool.deploy(sttAddr);
        await stakePool.waitForDeployment();
        const stakePoolAddr = await stakePool.getAddress();
        console.log("✅ StakePool 컨트랙트 배포 완료:", stakePoolAddr);

        // 8. Reserv 컨트랙트 배포
        console.log("\n8️⃣ Reserv 컨트랙트 배포 중...");
        const Reserv = await ethers.getContractFactory("Reserv");
        const reserv = await Reserv.deploy(sttAddr);
        await reserv.waitForDeployment();
        const reservAddr = await reserv.getAddress();
        console.log("✅ Reserv 컨트랙트 배포 완료:", reservAddr);

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
        
        const setContractsTx = await main.setContracts(managedContracts);
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
            network: await ethers.provider.getNetwork(),
            deployer: ethers.provider.getSigner().address, // 배포자 주소 가져오기
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
            deploymentTime: new Date().toISOString()
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
        console.log("\n🎯 배포 스크립트 실행 완료");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ 배포 스크립트 실행 실패:", error);
        process.exit(1);
    }); 