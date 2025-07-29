/**
 * @file Reserv.test.js
 * @notice Reserv 컨트랙트의 독립적인 기능 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Reserv Contract", function () {
    let reserv, sttToken;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // STT 토큰 컨트랙트 배포
        const SttToken = await ethers.getContractFactory("SttPermit");
        sttToken = await SttToken.deploy();
        await sttToken.waitForDeployment();

        // Reserv 컨트랙트 배포
        const Reserv = await ethers.getContractFactory("Reserv");
        reserv = await Reserv.deploy(await sttToken.getAddress());
        await reserv.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await reserv.stt()).to.equal(await sttToken.getAddress());
            expect(await reserv.owner()).to.equal(owner.address);
        });

        it("zero address로 STT 주소를 설정할 수 없어야 한다", async function () {
            const Reserv = await ethers.getContractFactory("Reserv");
            await expect(Reserv.deploy(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid token address");
        });
    });

    describe("Owner 관리", function () {
        it("owner가 아닌 계정은 withdraw를 호출할 수 없어야 한다", async function () {
            await expect(reserv.connect(user1).withdraw(user1.address, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(reserv, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pool 잔액 조회", function () {
        it("초기 Pool 잔액이 0이어야 한다", async function () {
            expect(await reserv.getDepositAmounts()).to.equal(0);
        });

        it("STT 토큰을 전송한 후 Pool 잔액이 증가해야 한다", async function () {
            const amount = ethers.parseEther("100");
            await sttToken.transfer(await reserv.getAddress(), amount);
            
            expect(await reserv.getDepositAmounts()).to.equal(amount);
        });
    });

    describe("출금 기능", function () {
        beforeEach(async function () {
            // Pool에 STT 토큰 전송
            const amount = ethers.parseEther("100");
            await sttToken.transfer(await reserv.getAddress(), amount);
        });

        it("owner가 출금할 수 있어야 한다", async function () {
            const withdrawAmount = ethers.parseEther("50");
            const balanceBefore = await sttToken.balanceOf(user1.address);
            
            await reserv.connect(owner).withdraw(user1.address, withdrawAmount);
            
            const balanceAfter = await sttToken.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
        });

        it("zero amount로 출금할 수 없어야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(user1.address, 0))
                .to.be.revertedWith("Zero amount");
        });

        it("zero address로 출금할 수 없어야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(ethers.ZeroAddress, ethers.parseEther("1")))
                .to.be.revertedWith("Invalid receiver");
        });

        it("잔액보다 많은 금액을 출금할 수 없어야 한다", async function () {
            const excessiveAmount = ethers.parseEther("200");
            await expect(reserv.connect(owner).withdraw(user1.address, excessiveAmount))
                .to.be.revertedWith("Insufficient balance");
        });
    });

    describe("이벤트 발생", function () {
        beforeEach(async function () {
            // Pool에 STT 토큰 전송
            const amount = ethers.parseEther("100");
            await sttToken.transfer(await reserv.getAddress(), amount);
        });

        it("출금 시 Withdrawn 이벤트가 발생해야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(user1.address, ethers.parseEther("50")))
                .to.emit(reserv, "Withdrawn")
                .withArgs(user1.address, ethers.parseEther("50"));
        });
    });

    describe("STT 토큰 상호작용", function () {
        it("STT 토큰 잔액을 올바르게 조회할 수 있어야 한다", async function () {
            const balance = await sttToken.balanceOf(await reserv.getAddress());
            expect(balance).to.equal(0);
        });

        it("STT 토큰을 Pool에 전송할 수 있어야 한다", async function () {
            const amount = ethers.parseEther("50");
            await sttToken.transfer(await reserv.getAddress(), amount);
            
            const poolBalance = await sttToken.balanceOf(await reserv.getAddress());
            expect(poolBalance).to.equal(amount);
        });
    });

    describe("Pool 상태 확인", function () {
        it("Pool이 STT 토큰을 보유할 수 있어야 한다", async function () {
            const amount = ethers.parseEther("100");
            await sttToken.transfer(await reserv.getAddress(), amount);
            
            const poolBalance = await reserv.getDepositAmounts();
            expect(poolBalance).to.equal(amount);
        });

        it("Pool의 잔액이 정확히 반영되어야 한다", async function () {
            const amount1 = ethers.parseEther("50");
            const amount2 = ethers.parseEther("30");
            
            await sttToken.transfer(await reserv.getAddress(), amount1);
            await sttToken.transfer(await reserv.getAddress(), amount2);
            
            const totalAmount = amount1 + amount2;
            const poolBalance = await reserv.getDepositAmounts();
            expect(poolBalance).to.equal(totalAmount);
        });

        it("출금 후 Pool 잔액이 감소해야 한다", async function () {
            const initialAmount = ethers.parseEther("100");
            const withdrawAmount = ethers.parseEther("30");
            
            await sttToken.transfer(await reserv.getAddress(), initialAmount);
            
            const balanceBefore = await reserv.getDepositAmounts();
            await reserv.connect(owner).withdraw(user1.address, withdrawAmount);
            const balanceAfter = await reserv.getDepositAmounts();
            
            expect(balanceAfter).to.equal(balanceBefore - withdrawAmount);
        });
    });

    describe("에러 처리", function () {
        it("존재하지 않는 토큰 주소로 컨트랙트를 배포할 수 없어야 한다", async function () {
            const Reserv = await ethers.getContractFactory("Reserv");
            await expect(Reserv.deploy(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid token address");
        });

        it("owner가 아닌 계정은 출금할 수 없어야 한다", async function () {
            await expect(reserv.connect(user1).withdraw(user2.address, ethers.parseEther("1")))
                .to.be.revertedWithCustomError(reserv, "OwnableUnauthorizedAccount");
        });
    });
}); 