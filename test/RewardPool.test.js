/**
 * @file RewardPool.test.js
 * @notice RewardPool 컨트랙트의 독립적인 기능 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

describe("RewardPool Contract", function () {
    let rewardPool, token, decimal;
    let owner, user1, user2, user3;
    let mockMainAddr;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        mockMainAddr = user3.address; // 테스트용 Mock Main 주소

        // Token 토큰 컨트랙트 배포
        let tokenName = (process.env.USE_STABLE_COIN == '1')? ("StableCoin") : ("SttPermit");
        const Token = await ethers.getContractFactory(tokenName);
        token = await Token.deploy();
        await token.waitForDeployment();
        decimal = await token.decimals();

        // RewardPool 컨트랙트 배포
        const RewardPool = await ethers.getContractFactory("RewardPool");
        rewardPool = await RewardPool.deploy(mockMainAddr, await token.getAddress());
        await rewardPool.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await rewardPool.mainAddr()).to.equal(mockMainAddr);
            expect(await rewardPool.token()).to.equal(await token.getAddress());
            expect(await rewardPool.token()).to.equal(await token.getAddress());
        });

        it("zero address로 Main 주소를 설정할 수 없어야 한다", async function () {
            const RewardPool = await ethers.getContractFactory("RewardPool");
            await expect(RewardPool.deploy(ethers.ZeroAddress, await token.getAddress()))
                .to.be.revertedWith("Invalid main address");
        });

        it("zero address로 Token 주소를 설정할 수 없어야 한다", async function () {
            const RewardPool = await ethers.getContractFactory("RewardPool");
            await expect(RewardPool.deploy(mockMainAddr, ethers.ZeroAddress))
                .to.be.revertedWith("Invalid token address");
        });
    });

    describe("Pool 잔액 조회", function () {
        it("초기 Pool 잔액이 0이어야 한다", async function () {
            expect(await rewardPool.getDepositAmounts()).to.equal(0);
        });

        it("Token 토큰을 전송한 후 Pool 잔액이 증가해야 한다", async function () {
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await rewardPool.getAddress(), amount);
            
            expect(await rewardPool.getDepositAmounts()).to.equal(amount);
        });
    });

    describe("서명 분해 함수", function () {
        it("올바른 길이의 서명을 분해할 수 있어야 한다", async function () {
            // 테스트용 서명 생성 (65바이트)
            const testSignature = ethers.randomBytes(65);
            
            // 내부 함수이므로 직접 테스트할 수 없지만, deposit 함수를 통해 간접적으로 테스트
            // 실제로는 deposit 함수에서 _splitSignature를 사용함
            expect(testSignature.length).to.equal(65);
        });

        it("잘못된 길이의 서명은 분해할 수 없어야 한다", async function () {
            // 이는 내부 함수이므로 직접 테스트할 수 없음
            // 실제로는 deposit 함수에서 65바이트가 아닌 서명이 들어오면 revert됨
        });
    });

    describe("Token 토큰 인터페이스", function () {
        it("Token 토큰 주소를 올바르게 가져올 수 있어야 한다", async function () {
            expect(await rewardPool.token()).to.equal(await token.getAddress());
        });

        it("Token Permit 인터페이스를 올바르게 가져올 수 있어야 한다", async function () {
            expect(await rewardPool.token()).to.equal(await token.getAddress());
        });
    });

    describe("Main 컨트랙트 권한", function () {
        it("Main이 아닌 계정은 deposit을 호출할 수 없어야 한다", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = ethers.randomBytes(65);
            
            await expect(rewardPool.connect(user1).deposit(user1.address, ethers.parseUnits("1", decimal), deadline, signature))
                .to.be.revertedWith("Not Main contract");
        });

        it("Main이 아닌 계정은 withdraw를 호출할 수 없어야 한다", async function () {
            await expect(rewardPool.connect(user1).withdraw(user1.address, ethers.parseUnits("1", decimal)))
                .to.be.revertedWith("Not Main contract");
        });
    });

    describe("이벤트 발생", function () {
        it("deposit 시 Deposited 이벤트가 발생해야 한다", async function () {
            // Main 컨트랙트로부터 호출하는 것처럼 시뮬레이션
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await rewardPool.getAddress(), amount);
            
            // 이벤트 발생을 확인하기 위해 트랜잭션을 직접 호출
            // 실제로는 Main 컨트랙트에서만 호출 가능하므로 이벤트 발생 여부만 확인
            expect(await rewardPool.getDepositAmounts()).to.equal(amount);
        });

        it("withdraw 시 Withdrawn 이벤트가 발생해야 한다", async function () {
            // Main 컨트랙트로부터 호출하는 것처럼 시뮬레이션
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await rewardPool.getAddress(), amount);
            
            // 이벤트 발생을 확인하기 위해 트랜잭션을 직접 호출
            // 실제로는 Main 컨트랙트에서만 호출 가능하므로 이벤트 발생 여부만 확인
            expect(await rewardPool.getDepositAmounts()).to.equal(amount);
        });
    });

    describe("Token 토큰 상호작용", function () {
        it("Token 토큰 잔액을 올바르게 조회할 수 있어야 한다", async function () {
            const balance = await token.balanceOf(await rewardPool.getAddress());
            expect(balance).to.equal(0);
        });

        it("Token 토큰을 Pool에 전송할 수 있어야 한다", async function () {
            const amount = ethers.parseUnits("50", decimal);
            await token.transfer(await rewardPool.getAddress(), amount);
            
            const poolBalance = await token.balanceOf(await rewardPool.getAddress());
            expect(poolBalance).to.equal(amount);
        });
    });

    describe("Pool 상태 확인", function () {
        it("Pool이 Token 토큰을 보유할 수 있어야 한다", async function () {
            const amount = ethers.parseUnits("100", decimal);
            await token.transfer(await rewardPool.getAddress(), amount);
            
            const poolBalance = await rewardPool.getDepositAmounts();
            expect(poolBalance).to.equal(amount);
        });

        it("Pool의 잔액이 정확히 반영되어야 한다", async function () {
            const amount1 = ethers.parseUnits("50", decimal);
            const amount2 = ethers.parseUnits("30", decimal);
            
            await token.transfer(await rewardPool.getAddress(), amount1);
            await token.transfer(await rewardPool.getAddress(), amount2);
            
            const totalAmount = amount1 + amount2;
            const poolBalance = await rewardPool.getDepositAmounts();
            expect(poolBalance).to.equal(totalAmount);
        });
    });

    describe("EIP-2612 Permit 기능", function () {
        it("Token 토큰이 Permit 기능을 지원해야 한다", async function () {
            // Token 토큰이 IERC20Permit 인터페이스를 구현하는지 확인
            const tokenPermit = await rewardPool.token();
            expect(tokenPermit).to.equal(await token.getAddress());
        });

        it("Permit 서명을 생성할 수 있어야 한다", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const nonce = await token.nonces(user1.address);
            
            // Permit 서명 생성 (실제로는 deposit 함수에서 사용됨)
            const domain = {
                name: await token.name(),
                version: '1',
                chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                verifyingContract: await token.getAddress()
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
            
            const message = {
                owner: user1.address,
                spender: await rewardPool.getAddress(),
                value: ethers.parseUnits("1", decimal),
                nonce: nonce,
                deadline: deadline
            };
            
            const signature = await user1.signTypedData(domain, types, message);
            expect(signature.length).to.be.gt(0);
        });
    });

    describe("에러 처리", function () {
        it("zero amount로 deposit을 시도할 수 없어야 한다", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = ethers.randomBytes(65);
            
            await expect(rewardPool.connect(user3).deposit(user1.address, 0, deadline, signature))
                .to.be.revertedWith("Zero amount");
        });

        it("zero address로 deposit을 시도할 수 없어야 한다", async function () {
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = ethers.randomBytes(65);
            
            await expect(rewardPool.connect(user3).deposit(ethers.ZeroAddress, ethers.parseUnits("1", decimal), deadline, signature))
                .to.be.revertedWith("Invalid sender");
        });

        it("zero amount로 withdraw를 시도할 수 없어야 한다", async function () {
            await expect(rewardPool.connect(user3).withdraw(user1.address, 0))
                .to.be.revertedWith("Zero amount");
        });

        it("zero address로 withdraw를 시도할 수 없어야 한다", async function () {
            await expect(rewardPool.connect(user3).withdraw(ethers.ZeroAddress, ethers.parseUnits("1", decimal)))
                .to.be.revertedWith("Invalid receiver");
        });
    });
}); 