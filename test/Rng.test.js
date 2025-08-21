const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Rng Contract", function () {
    let rng;
    let owner, user1, user2, signer;
    let mainAddr;

    beforeEach(async function () {
        [owner, user1, user2, signer, mainAddr] = await ethers.getSigners();
        
        const Rng = await ethers.getContractFactory("Rng");
        rng = await Rng.deploy(mainAddr.address, signer.address);
        await rng.waitForDeployment();
    });

    describe("초기화", function () {
        it("올바른 초기값으로 설정되어야 한다", async function () {
            expect(await rng.mainAddr()).to.equal(mainAddr.address);
            expect(await rng.signerAddr()).to.equal(signer.address);
            expect(await rng.owner()).to.equal(owner.address);
        });

        it("상수값들이 올바르게 설정되어야 한다", async function () {
            expect(await rng.ENTROPY_FACTOR1()).to.equal(65);
            expect(await rng.ENTROPY_FACTOR2()).to.equal(69);
        });
    });

    describe("Owner 권한", function () {
        it("Owner만 signer를 변경할 수 있어야 한다", async function () {
            await expect(rng.connect(user1).setSigner(user2.address))
                .to.be.revertedWithCustomError(rng, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });

        it("Owner가 signer를 변경할 수 있어야 한다", async function () {
            await rng.connect(owner).setSigner(user2.address);
            expect(await rng.signerAddr()).to.equal(user2.address);
        });

        it("잘못된 주소로 signer를 설정할 수 없어야 한다", async function () {
            await expect(rng.connect(owner).setSigner(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid address");
        });

        it("signer 변경 시 이벤트가 발생해야 한다", async function () {
            await expect(rng.connect(owner).setSigner(user2.address))
                .to.emit(rng, "SignerUpdated")
                .withArgs(user2.address);
        });
    });

    describe("onlyMain 제한", function () {
        it("Main 컨트랙트가 아닌 주소는 commit을 호출할 수 없어야 한다", async function () {
            const signature = ethers.randomBytes(65);
            await expect(rng.connect(user1).commit(1, signature))
                .to.be.revertedWith("Not Main contract");
        });

        it("Main 컨트랙트가 아닌 주소는 sealEntropy를 호출할 수 없어야 한다", async function () {
            await expect(rng.connect(user1).sealEntropy(1, user2.address))
                .to.be.revertedWith("Not Main contract");
        });

        it("Main 컨트랙트가 아닌 주소는 reveal을 호출할 수 없어야 한다", async function () {
            await expect(rng.connect(user1).reveal(1, 12345))
                .to.be.revertedWith("Not Main contract");
        });
    });

    describe("RoundRngInfo 구조체", function () {
        it("초기에는 라운드 정보가 비어있어야 한다", async function () {
            const roundInfo = await rng.roundRngInfo(1);
            expect(roundInfo.ender).to.equal(ethers.ZeroAddress);
            expect(roundInfo.blockTime).to.equal(0);
            expect(roundInfo.salt).to.equal(ethers.ZeroHash);
            expect(roundInfo.finalRands).to.equal(ethers.ZeroHash);
            expect(roundInfo.signature).to.equal("0x");
        });
    });

    describe("finalRandsOf 함수", function () {
        it("존재하지 않는 라운드의 finalRands는 0이어야 한다", async function () {
            const finalRands = await rng.finalRandsOf(999);
            expect(finalRands).to.equal(ethers.ZeroHash);
        });
    });

    describe("EIP-712 서명 검증", function () {
        it("SIGDATA_TYPEHASH가 올바르게 설정되어야 한다", async function () {
            const expectedHash = ethers.keccak256(
                ethers.toUtf8Bytes("SigData(uint256 roundId,uint256 randSeed)")
            );
            expect(await rng.SIGDATA_TYPEHASH()).to.equal(expectedHash);
        });
    });

    describe("이벤트 발생", function () {
        it("signer 변경 시 SignerUpdated 이벤트가 발생해야 한다", async function () {
            await expect(rng.connect(owner).setSigner(user2.address))
                .to.emit(rng, "SignerUpdated")
                .withArgs(user2.address);
        });
    });

    describe("컨트랙트 상태 조회", function () {
        it("mainAddr를 조회할 수 있어야 한다", async function () {
            expect(await rng.mainAddr()).to.equal(mainAddr.address);
        });

        it("signerAddr를 조회할 수 있어야 한다", async function () {
            expect(await rng.signerAddr()).to.equal(signer.address);
        });

        it("owner를 조회할 수 있어야 한다", async function () {
            expect(await rng.owner()).to.equal(owner.address);
        });
    });

    describe("상수값 검증", function () {
        it("ENTROPY_FACTOR1이 65이어야 한다", async function () {
            expect(await rng.ENTROPY_FACTOR1()).to.equal(65);
        });

        it("ENTROPY_FACTOR2가 69이어야 한다", async function () {
            expect(await rng.ENTROPY_FACTOR2()).to.equal(69);
        });
    });

    describe("잘못된 입력값 처리", function () {
        it("0 주소로 signer를 설정할 수 없어야 한다", async function () {
            await expect(rng.connect(owner).setSigner(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid address");
        });

        it("생성자에서 0 주소로 mainAddr를 설정할 수 없어야 한다", async function () {
            const Rng = await ethers.getContractFactory("Rng");
            await expect(Rng.deploy(ethers.ZeroAddress, signer.address))
                .to.be.revertedWith("Invalid Main address");
        });
    });

    describe("권한 검증", function () {
        it("일반 사용자는 signer를 변경할 수 없어야 한다", async function () {
            await expect(rng.connect(user1).setSigner(user2.address))
                .to.be.revertedWithCustomError(rng, "OwnableUnauthorizedAccount")
                .withArgs(user1.address);
        });

        it("일반 사용자는 Main 전용 함수를 호출할 수 없어야 한다", async function () {
            const signature = ethers.randomBytes(65);
            await expect(rng.connect(user1).commit(1, signature))
                .to.be.revertedWith("Not Main contract");
        });
    });

    describe("데이터 구조 검증", function () {
        it("RoundRngInfo 구조체의 모든 필드가 올바른 타입이어야 한다", async function () {
            // 이 테스트는 구조체 정의가 올바른지 확인하는 간접적인 방법입니다
            const roundInfo = await rng.roundRngInfo(1);
            
            // address 타입 검증
            expect(typeof roundInfo.ender).to.equal("string");
            
            // uint256 타입 검증
            expect(typeof roundInfo.blockTime).to.equal("bigint");
            expect(typeof roundInfo.salt).to.equal("string");
            expect(typeof roundInfo.finalRands).to.equal("string");
            
            // bytes 타입 검증
            expect(typeof roundInfo.signature).to.equal("string");
        });
    });

    describe("컨트랙트 배포 검증", function () {
        it("올바른 파라미터로 컨트랙트가 배포되어야 한다", async function () {
            const Rng = await ethers.getContractFactory("Rng");
            const testRng = await Rng.deploy(user1.address, user2.address);
            await testRng.waitForDeployment();
            
            expect(await testRng.mainAddr()).to.equal(user1.address);
            expect(await testRng.signerAddr()).to.equal(user2.address);
        });
    });
}); 