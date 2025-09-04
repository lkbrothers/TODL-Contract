/**
 * @file Reserv.test.js
 * @notice Reserv 컨트랙트의 독립적인 기능 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

describe("Reserv Contract", function () {
    let reserv, token, decimal;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // Token 토큰 컨트랙트 배포
        let tokenName = (process.env.USE_STABLE_COIN == '1')? ("StableCoin") : ("SttPermit");
        const Token = await ethers.getContractFactory(tokenName);
        token = await Token.deploy();
        await token.waitForDeployment();
        decimal = await token.decimals();

        // Reserv 컨트랙트 배포
        const Reserv = await ethers.getContractFactory("Reserv");
        reserv = await Reserv.deploy(await token.getAddress());
        await reserv.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await reserv.token()).to.equal(await token.getAddress());
            expect(await reserv.owner()).to.equal(owner.address);
        });

        it("zero address로 Token 주소를 설정할 수 없어야 한다", async function () {
            const Reserv = await ethers.getContractFactory("Reserv");
            await expect(Reserv.deploy(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid token address");
        });
    });

    describe("Owner 관리", function () {
        it("owner가 아닌 계정은 withdraw를 호출할 수 없어야 한다", async function () {
            await expect(reserv.connect(user1).withdraw(user1.address, ethers.parseUnits("1", decimal)))
                .to.be.revertedWithCustomError(reserv, "OwnableUnauthorizedAccount");
        });
    });

    describe("Pool 잔액 조회", function () {
        it("초기 Pool 잔액이 0이어야 한다", async function () {
            expect(await reserv.getDepositAmounts()).to.equal(0);
        });

        it("Token 토큰을 전송한 후 Pool 잔액이 증가해야 한다", async function () {
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await reserv.getAddress(), amount);
            
            expect(await reserv.getDepositAmounts()).to.equal(amount);
        });
    });

    describe("출금 기능", function () {
        beforeEach(async function () {
            // Pool에 Token 토큰 전송
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await reserv.getAddress(), amount);
        });

        it("owner가 출금할 수 있어야 한다", async function () {
            const withdrawAmount = ethers.parseUnits("50", decimal);
            const balanceBefore = await token.balanceOf(user1.address);
            
            await reserv.connect(owner).withdraw(user1.address, withdrawAmount);
            
            const balanceAfter = await token.balanceOf(user1.address);
            expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
        });

        it("zero amount로 출금할 수 없어야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(user1.address, 0))
                .to.be.revertedWith("Zero amount");
        });

        it("zero address로 출금할 수 없어야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(ethers.ZeroAddress, ethers.parseUnits("1", decimal)))
                .to.be.revertedWith("Invalid receiver");
        });

        it("잔액보다 많은 금액을 출금할 수 없어야 한다", async function () {
            const excessiveAmount = ethers.parseUnits("200", decimal);
            await expect(reserv.connect(owner).withdraw(user1.address, excessiveAmount))
                .to.be.revertedWith("Insufficient balance");
        });
    });

    describe("이벤트 발생", function () {
        beforeEach(async function () {
            // Pool에 Token 토큰 전송
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await reserv.getAddress(), amount);
        });

        it("출금 시 Withdrawn 이벤트가 발생해야 한다", async function () {
            await expect(reserv.connect(owner).withdraw(user1.address, ethers.parseUnits("50", decimal)))
                .to.emit(reserv, "Withdrawn")
                .withArgs(user1.address, ethers.parseUnits("50", decimal));
        });
    });

    describe("Token 토큰 상호작용", function () {
        it("Token 토큰 잔액을 올바르게 조회할 수 있어야 한다", async function () {
            const balance = await token.balanceOf(await reserv.getAddress());
            expect(balance).to.equal(0);
        });

        it("Token 토큰을 Pool에 전송할 수 있어야 한다", async function () {
            const amount = ethers.parseUnits("50", decimal);
            await token.transfer(await reserv.getAddress(), amount);
            
            const poolBalance = await token.balanceOf(await reserv.getAddress());
            expect(poolBalance).to.equal(amount);
        });
    });

    describe("Pool 상태 확인", function () {
        it("Pool이 Token 토큰을 보유할 수 있어야 한다", async function () {
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await reserv.getAddress(), amount);
            
            const poolBalance = await reserv.getDepositAmounts();
            expect(poolBalance).to.equal(amount);
        });

        it("Pool의 잔액이 정확히 반영되어야 한다", async function () {
            const amount1 = ethers.parseUnits("50", decimal);
            const amount2 = ethers.parseUnits("30", decimal);
            
            await token.transfer(await reserv.getAddress(), amount1);
            await token.transfer(await reserv.getAddress(), amount2);
            
            const totalAmount = amount1 + amount2;
            const poolBalance = await reserv.getDepositAmounts();
            expect(poolBalance).to.equal(totalAmount);
        });

        it("출금 후 Pool 잔액이 감소해야 한다", async function () {
            const initialAmount = ethers.parseUnits("100", decimal);
            const withdrawAmount = ethers.parseUnits("30", decimal);
            
            await token.transfer(await reserv.getAddress(), initialAmount);
            
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
            await expect(reserv.connect(user1).withdraw(user2.address, ethers.parseUnits("1", decimal)))
                .to.be.revertedWithCustomError(reserv, "OwnableUnauthorizedAccount");
        });
    });
}); 