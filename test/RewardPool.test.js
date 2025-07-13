const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("RewardPool Contract", function () {
    let rewardPool, sttToken;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        
        // 컨트랙트 배포
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const SttToken = await ethers.getContractFactory("SttPermit");
        
        rewardPool = await RewardPool.deploy();
        sttToken = await SttToken.deploy();
        
        // RewardPool에 STT 토큰 주소 설정
        await rewardPool.setSttToken(sttToken.target);
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await rewardPool.sttToken()).to.equal(sttToken.target);
        });
    });

    describe("STT 토큰 설정", function () {
        it("STT 토큰 주소를 설정할 수 있어야 한다", async function () {
            const newSttToken = user1.address;
            await rewardPool.setSttToken(newSttToken);
            expect(await rewardPool.sttToken()).to.equal(newSttToken);
        });

        it("owner가 아닌 계정은 STT 토큰 주소를 설정할 수 없어야 한다", async function () {
            await expect(
                rewardPool.connect(user1).setSttToken(user2.address)
            ).to.be.revertedWithCustomError(rewardPool, "OwnableUnauthorizedAccount");
        });
    });

    describe("자금 관리", function () {
        beforeEach(async function () {
            // STT 토큰 민팅
            await sttToken.mint(user1.address, ethers.parseEther("1000"));
            await sttToken.connect(user1).approve(rewardPool.target, ethers.parseEther("1000"));
        });

        it("자금을 입금할 수 있어야 한다", async function () {
            const amount = ethers.parseEther("100");
            await rewardPool.connect(user1).deposit(amount);
            
            expect(await sttToken.balanceOf(rewardPool.target)).to.equal(amount);
        });

        it("자금을 출금할 수 있어야 한다", async function () {
            const amount = ethers.parseEther("100");
            await rewardPool.connect(user1).deposit(amount);
            
            await rewardPool.connect(owner).withdraw(amount, user2.address);
            
            expect(await sttToken.balanceOf(user2.address)).to.equal(amount);
            expect(await sttToken.balanceOf(rewardPool.target)).to.equal(0);
        });

        it("owner가 아닌 계정은 자금을 출금할 수 없어야 한다", async function () {
            const amount = ethers.parseEther("100");
            await rewardPool.connect(user1).deposit(amount);
            
            await expect(
                rewardPool.connect(user1).withdraw(amount, user2.address)
            ).to.be.revertedWithCustomError(rewardPool, "OwnableUnauthorizedAccount");
        });

        it("충분한 잔액이 없으면 출금할 수 없어야 한다", async function () {
            const amount = ethers.parseEther("100");
            await rewardPool.connect(user1).deposit(amount);
            
            await expect(
                rewardPool.connect(owner).withdraw(ethers.parseEther("200"), user2.address)
            ).to.be.revertedWith("Insufficient balance");
        });
    });

    describe("승인 관리", function () {
        it("승인을 설정할 수 있어야 한다", async function () {
            await rewardPool.connect(owner).setApproval(user1.address, true);
            expect(await rewardPool.approvals(user1.address)).to.be.true;
        });

        it("승인을 해제할 수 있어야 한다", async function () {
            await rewardPool.connect(owner).setApproval(user1.address, true);
            await rewardPool.connect(owner).setApproval(user1.address, false);
            expect(await rewardPool.approvals(user1.address)).to.be.false;
        });

        it("owner가 아닌 계정은 승인을 설정할 수 없어야 한다", async function () {
            await expect(
                rewardPool.connect(user1).setApproval(user2.address, true)
            ).to.be.revertedWithCustomError(rewardPool, "OwnableUnauthorizedAccount");
        });
    });
}); 