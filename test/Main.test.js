const { expect } = require("chai");
const { ethers } = require("hardhat");

// 헬퍼 함수들
async function startRoundWithSignature(main, rng, admin, roundId = 1, randSeed = 5) {
    const rngDomain = {
        name: 'Custom-Rng',
        version: '1',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await rng.getAddress()
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
    
    const rngSignature = await admin.signTypedData(rngDomain, rngTypes, rngMessage);
    const tx = await main.connect(admin).startRound(rngSignature);
    await tx.wait(); // 블록 확정 대기
}

describe("Main Contract", function () {
    let main, itemParts, agent, rng, rewardPool, stakePool, reserv, sttToken;
    let owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3;
    let managedContracts;

    beforeEach(async function () {
        [owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3] = await ethers.getSigners();

        // 컨트랙트 배포
        const Main = await ethers.getContractFactory("Main");
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        const Agent = await ethers.getContractFactory("AgentNFT");
        const Rng = await ethers.getContractFactory("Rng");
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const StakePool = await ethers.getContractFactory("StakePool");
        const Reserv = await ethers.getContractFactory("Reserv");
        const SttToken = await ethers.getContractFactory("SttPermit");

        // STT 토큰 먼저 배포
        sttToken = await SttToken.deploy();
        await sttToken.waitForDeployment();
        let sttAddr = await sttToken.getAddress();

        // Main 컨트랙트 배포 (생성자에 필요한 파라미터 전달)
        main = await Main.deploy([admin.address, carrier.address], donateAddr.address, corporateAddr.address, operationAddr.address);
        await main.waitForDeployment();
        let mainAddr = await main.getAddress();

        // 다른 컨트랙트들 배포
        itemParts = await ItemParts.deploy(mainAddr);
        await itemParts.waitForDeployment();
        agent = await Agent.deploy(mainAddr);
        await agent.waitForDeployment();
        rng = await Rng.deploy(mainAddr, admin.address);
        await rng.waitForDeployment();
        rewardPool = await RewardPool.deploy(mainAddr, sttAddr);
        await rewardPool.waitForDeployment();
        stakePool = await StakePool.deploy(sttAddr);
        await stakePool.waitForDeployment();
        reserv = await Reserv.deploy(sttAddr);
        await reserv.waitForDeployment();

        // managedContracts 설정
        managedContracts = await Promise.all([
            itemParts.getAddress(),
            agent.getAddress(),
            rng.getAddress(),
            rewardPool.getAddress(),
            stakePool.getAddress(),
            reserv.getAddress(),
            sttToken.getAddress()
        ]);
        await main.setContracts(managedContracts);

        // 사용자들에게 STT 토큰 지급
        await sttToken.transfer(user1.address, ethers.parseEther("1000"));
        await sttToken.transfer(user2.address, ethers.parseEther("1000"));
        await sttToken.transfer(user3.address, ethers.parseEther("1000"));
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await main.roundId()).to.equal(0);
            expect(await main.admins(owner.address)).to.equal(true);
            expect(await main.admins(admin.address)).to.equal(true);
            expect(await main.admins(carrier.address)).to.equal(true);
            expect(await main.donateAddr()).to.equal(donateAddr.address);
            expect(await main.corporateAddr()).to.equal(corporateAddr.address);
            expect(await main.operationAddr()).to.equal(operationAddr.address);
        });

        it("managedContracts가 올바르게 설정되어야 한다", async function () {
            expect(await main.managedContracts(0)).to.equal(await main.getAddress());
            expect(await main.managedContracts(1)).to.equal(await itemParts.getAddress());
            expect(await main.managedContracts(2)).to.equal(await agent.getAddress());
            expect(await main.managedContracts(3)).to.equal(await rng.getAddress());
            expect(await main.managedContracts(4)).to.equal(await rewardPool.getAddress());
            expect(await main.managedContracts(5)).to.equal(await stakePool.getAddress());
            expect(await main.managedContracts(6)).to.equal(await reserv.getAddress());
            expect(await main.managedContracts(7)).to.equal(await sttToken.getAddress());
        });
    });

    describe("Admin 관리", function () {
        it("admin 주소를 설정할 수 있어야 한다", async function () {
            const newAdmin = user1.address;
            await main.setAdminAddress(newAdmin, true);
            expect(await main.admins(newAdmin)).to.equal(true);
            await main.setAdminAddress(newAdmin, false);
            expect(await main.admins(newAdmin)).to.equal(false);
        });

        it("zero address로 설정할 수 없어야 한다", async function () {
            await expect(main.setAdminAddress(ethers.ZeroAddress, true))
                .to.be.revertedWith("admin: zero address");
        });

        it("같은 세팅으로 설정할 수 없어야 한다", async function () {
            await expect(main.setAdminAddress(admin.address, true))
                .to.be.revertedWith("admin: same setting");
            await expect(main.setAdminAddress(user1.address, false))
                .to.be.revertedWith("admin: same setting");
        });

        it("owner가 아닌 계정은 주소를 설정할 수 없어야 한다", async function () {
            await expect(main.connect(user1).setAdminAddress(user2.address, true))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
        });
    });

    describe("주소 설정", function () {
        it("기부금 주소를 설정할 수 있어야 한다", async function () {
            const newDonateAddr = user1.address;
            await main.setDonateAddress(newDonateAddr);
            expect(await main.donateAddr()).to.equal(newDonateAddr);
        });

        it("영리법인 주소를 설정할 수 있어야 한다", async function () {
            const newCorporateAddr = user2.address;
            await main.setCorporateAddress(newCorporateAddr);
            expect(await main.corporateAddr()).to.equal(newCorporateAddr);
        });

        it("운영비 주소를 설정할 수 있어야 한다", async function () {
            const newOperationAddr = user3.address;
            await main.setOperationAddress(newOperationAddr);
            expect(await main.operationAddr()).to.equal(newOperationAddr);
        });

        it("zero address로 설정할 수 없어야 한다", async function () {
            await expect(main.setDonateAddress(ethers.ZeroAddress))
                .to.be.revertedWith("donate: zero address");
            await expect(main.setCorporateAddress(ethers.ZeroAddress))
                .to.be.revertedWith("corporate: zero address");
            await expect(main.setOperationAddress(ethers.ZeroAddress))
                .to.be.revertedWith("operation: zero address");
        });

        it("같은 주소로 설정할 수 없어야 한다", async function () {
            await expect(main.setDonateAddress(donateAddr.address))
                .to.be.revertedWith("donate: same address");
            await expect(main.setCorporateAddress(corporateAddr.address))
                .to.be.revertedWith("corporate: same address");
            await expect(main.setOperationAddress(operationAddr.address))
                .to.be.revertedWith("operation: same address");
        });

        it("owner가 아닌 계정은 주소를 설정할 수 없어야 한다", async function () {
            await expect(main.connect(user1).setDonateAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
            await expect(main.connect(user1).setCorporateAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
            await expect(main.connect(user1).setOperationAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
        });
    });

    describe("라운드 관리", function () {
        beforeEach(async function () {
            // 라운드 시작을 위한 기본 설정
            await startRoundWithSignature(main, rng, admin);
        });

        it("라운드를 시작할 수 있어야 한다", async function () {
            expect(await main.roundId()).to.equal(1);
            expect(await main.getRoundStatus(1)).to.equal(0); // Proceeding
        });

        it("admin이 아닌 계정은 라운드를 시작할 수 없어야 한다", async function () {
            await expect(main.connect(user1).startRound("0x"))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("이전 라운드가 완료되지 않으면 새 라운드를 시작할 수 없어야 한다", async function () {
            await expect(main.connect(admin).startRound("0x"))
                .to.be.revertedWithCustomError(main, "LastRoundNotEnded");
        });

        it("라운드 상태를 조회할 수 있어야 한다", async function () {
            expect(await main.getRoundStatus(1)).to.equal(0); // Proceeding
        });
    });

    describe("STT 잔액 조회", function () {
        it("사용자의 STT 잔액을 조회할 수 있어야 한다", async function () {
            const balance = await main.getCoinBalance(user1.address);
            expect(balance).to.equal(ethers.parseEther("1000"));
        });
    });

    describe("Agent 구매", function () {
        beforeEach(async function () {
            // 사용자에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
            const requiredParts = new Set(); // 필요한 부위들을 추적
            const maxAttempts = 50; // 최대 시도 횟수 (무한 루프 방지)
            let attempts = 0;
            
            while (requiredParts.size < 5 && attempts < maxAttempts) {
                const tx = await itemParts.connect(user1).mint();
                await tx.wait(); // 블록 확정 대기
                attempts++;
                
                // user1이 보유한 모든 ItemParts 확인
                const balance = await itemParts.balanceOf(user1.address);
                for (let i = 0; i < balance; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts.add(tokenInfo.partsIndex);
                }
            }
            
            // 각 부위별로 하나씩 있는지 확인
            expect(requiredParts.size).to.equal(5);
            
            // Agent 구매에 필요한 토큰 ID들을 수집
            const userTokens = [];
            const balance = await itemParts.balanceOf(user1.address);
            for (let i = 0; i < balance; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                userTokens.push(tokenId);
            }
            
            // 테스트에서 사용할 토큰 ID들을 저장
            this.userTokens = userTokens;
        });

        it("Agent를 구매할 수 있어야 한다", async function () {
            // 라운드를 진행중 상태로 변경
            await startRoundWithSignature(main, rng, admin);
            
            // startRound 후 상태 확인
            const afterStartRoundId = await main.roundId();
            const afterStartRoundStatus = await main.getRoundStatus(afterStartRoundId);
            console.log('After startRound - Round ID:', afterStartRoundId, 'Status:', afterStartRoundStatus);
            
            // 라운드 1의 상태도 확인
            const round1Status = await main.getRoundStatus(1);
            console.log('Round 1 Status:', round1Status);
            
            const itemPartsIds = this.userTokens.slice(0, 5); // 처음 5개 토큰 사용
            console.log('ItemParts IDs:', itemPartsIds);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            console.log('111')
            
            // Permit 서명 생성
            const domain = {
                name: await sttToken.name(),
                version: '1',
                chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                verifyingContract: await sttToken.getAddress()
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
                value: ethers.parseEther("1"),
                nonce: await sttToken.nonces(user1.address),
                deadline: deadline
            };
            
            const signature = await user1.signTypedData(domain, types, message);
            console.log('222')
            
            // 라운드 상태 확인
            const beforeBuyRoundId = await main.roundId();
            const beforeBuyRoundStatus = await main.getRoundStatus(beforeBuyRoundId);
            console.log('Before buyAgent - Round ID:', beforeBuyRoundId);
            console.log('Before buyAgent - Round Status:', beforeBuyRoundStatus);
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
            console.log('333')
            
            // Agent가 민팅되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(1);
            console.log('444')
        });

        it("라운드가 진행중이 아니면 Agent를 구매할 수 없어야 한다", async function () {
            // 라운드를 종료 상태로 변경
            await main.connect(admin).endRound(1);
            
            const itemPartsIds = this.userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWith("Round is not proceeding");
        });

        it("STT 잔액이 부족하면 Agent를 구매할 수 없어야 한다", async function () {
            // 사용자의 STT 잔액을 0으로 만듦
            await sttToken.connect(user1).transfer(ethers.ZeroAddress, await sttToken.balanceOf(user1.address));
            
            const itemPartsIds = this.userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "InsufficientCoin");
        });

        it("올바르지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const itemPartsIds = [...this.userTokens.slice(0, 4), 999]; // 잘못된 토큰 ID 포함
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "InvalidParts");
        });

        it("소유하지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const itemPartsIds = this.userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user2).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "NotItemPartsOwner");
        });
    });

    describe("라운드 세일 종료", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // 사용자에게 각 부위별 ItemParts 지급
            const requiredParts = new Set();
            const maxAttempts = 50;
            let attempts = 0;
            
            while (requiredParts.size < 5 && attempts < maxAttempts) {
                const tx = await itemParts.connect(user1).mint();
                await tx.wait(); // 블록 확정 대기
                attempts++;
                
                const balance = await itemParts.balanceOf(user1.address);
                for (let i = 0; i < balance; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts.add(tokenInfo.partsIndex);
                }
            }
            
            expect(requiredParts.size).to.equal(5);
            
            const userTokens = [];
            const balance = await itemParts.balanceOf(user1.address);
            for (let i = 0; i < balance; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                userTokens.push(tokenId);
            }
            
            const itemPartsIds = userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user1.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user1.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user1.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
        });

        it("Agent 소유자가 라운드 세일을 종료할 수 있어야 한다", async function () {
            // 시간을 조작하여 세일 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [86400]); // 24시간 증가
            await ethers.provider.send("evm_mine");
            
            await main.connect(user1).closeTicketRound();
            expect(await main.getRoundStatus(1)).to.equal(1); // Drawing
        });

        it("admin은 라운드 세일을 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(admin).closeTicketRound())
                .to.be.revertedWith("Not permitted");
        });

        it("Agent를 소유하지 않은 사용자는 라운드 세일을 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user2).closeTicketRound())
                .to.be.revertedWith("Not Owned Agent");
        });

        it("라운드가 진행중이 아니면 세일을 종료할 수 없어야 한다", async function () {
            await expect(main.connect(user1).closeTicketRound())
                .to.be.revertedWith("Round is not proceeding");
        });
    });

    describe("라운드 정산", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // Agent 구매 및 세일 종료
            const requiredParts = new Set();
            const maxAttempts = 50;
            let attempts = 0;
            
            while (requiredParts.size < 5 && attempts < maxAttempts) {
                const tx = await itemParts.connect(user1).mint();
                await tx.wait(); // 블록 확정 대기
                attempts++;
                
                const balance = await itemParts.balanceOf(user1.address);
                for (let i = 0; i < balance; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts.add(tokenInfo.partsIndex);
                }
            }
            
            expect(requiredParts.size).to.equal(5);
            
            const userTokens = [];
            const balance = await itemParts.balanceOf(user1.address);
            for (let i = 0; i < balance; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                userTokens.push(tokenId);
            }
            
            const itemPartsIds = userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user1.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user1.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user1.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
            
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await main.connect(user1).closeTicketRound();
        });

        it("admin이 라운드를 정산할 수 있어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).settleRound(5);
            expect(await main.getRoundStatus(1)).to.equal(2); // Claiming
        });

        it("admin이 아닌 계정은 라운드를 정산할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).settleRound(5))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 Drawing 상태가 아니면 정산할 수 없어야 한다", async function () {
            await expect(main.connect(admin).settleRound(5))
                .to.be.revertedWith("Round is not drawing");
        });
    });

    describe("당첨금 수령", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // Agent 구매 및 정산
            const requiredParts = new Set();
            const maxAttempts = 50;
            let attempts = 0;
            
            while (requiredParts.size < 5 && attempts < maxAttempts) {
                const tx = await itemParts.connect(user1).mint();
                await tx.wait(); // 블록 확정 대기
                attempts++;
                
                const balance = await itemParts.balanceOf(user1.address);
                for (let i = 0; i < balance; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts.add(tokenInfo.partsIndex);
                }
            }
            
            expect(requiredParts.size).to.equal(5);
            
            const userTokens = [];
            const balance = await itemParts.balanceOf(user1.address);
            for (let i = 0; i < balance; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                userTokens.push(tokenId);
            }
            
            const itemPartsIds = userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user1.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user1.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user1.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
            
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await main.connect(user1).closeTicketRound();
            
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).settleRound(5);
        });

        it("당첨 Agent 소유자가 당첨금을 수령할 수 있어야 한다", async function () {
            const agentId = 0; // 첫 번째 Agent
            const initialBalance = await sttToken.balanceOf(user1.address);
            
            await main.connect(user1).claim(1, agentId);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("Agent 소유자가 아닌 사용자는 당첨금을 수령할 수 없어야 한다", async function () {
            const agentId = 0;
            
            await expect(main.connect(user2).claim(1, agentId))
                .to.be.revertedWith("claim: Not owner");
        });

        it("당첨 Agent가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            // 다른 Agent를 생성
            const requiredParts2 = new Set();
            const maxAttempts2 = 50;
            let attempts2 = 0;
            
            while (requiredParts2.size < 5 && attempts2 < maxAttempts2) {
                const tx = await itemParts.connect(user2).mint();
                await tx.wait(); // 블록 확정 대기
                attempts2++;
                
                const balance2 = await itemParts.balanceOf(user2.address);
                for (let i = 0; i < balance2; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts2.add(tokenInfo.partsIndex);
                }
            }
            
            expect(requiredParts2.size).to.equal(5);
            
            const user2Tokens = [];
            const balance2 = await itemParts.balanceOf(user2.address);
            for (let i = 0; i < balance2; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                user2Tokens.push(tokenId);
            }
            
            const itemPartsIds = user2Tokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user2.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user2.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user2.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user2).buyAgent(itemPartsIds, deadline, signature);
            
            const agentId = 1; // 두 번째 Agent
            
            await expect(main.connect(user2).claim(1, agentId))
                .to.be.revertedWith("claim: Not winner");
        });

        it("라운드가 Claiming 상태가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            const agentId = 0;
            
            // 라운드를 종료 상태로 변경
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(user1).claim(1, agentId))
                .to.be.revertedWith("claim: Not winner");
        });
    });

    describe("환불", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // Agent 구매
            const requiredParts = new Set();
            const maxAttempts = 50;
            let attempts = 0;
            
            while (requiredParts.size < 5 && attempts < maxAttempts) {
                const tx = await itemParts.connect(user1).mint();
                await tx.wait(); // 블록 확정 대기
                attempts++;
                
                const balance = await itemParts.balanceOf(user1.address);
                for (let i = 0; i < balance; i++) {
                    const tokenId = i; // 순차적으로 증가하는 토큰 ID
                    const tokenInfo = await itemParts.tokenInfo(tokenId);
                    requiredParts.add(tokenInfo.partsIndex);
                }
            }
            
            expect(requiredParts.size).to.equal(5);
            
            const userTokens = [];
            const balance = await itemParts.balanceOf(user1.address);
            for (let i = 0; i < balance; i++) {
                const tokenId = i; // 순차적으로 증가하는 토큰 ID
                userTokens.push(tokenId);
            }
            
            const itemPartsIds = userTokens.slice(0, 5);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user1.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user1.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user1.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
        });

        it("환불 시간이 지나면 Agent를 환불할 수 있어야 한다", async function () {
            // 환불 가능 시간으로 설정 (ROUND_REFUND_AVAIL_TIME 이후)
            await ethers.provider.send("evm_increaseTime", [172800]); // 48시간 증가
            await ethers.provider.send("evm_mine");
            
            const agentId = 0;
            const initialBalance = await sttToken.balanceOf(user1.address);
            
            await main.connect(user1).refund(1, agentId);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("환불 시간이 지나지 않으면 환불할 수 없어야 한다", async function () {
            const agentId = 0;
            
            await expect(main.connect(user1).refund(1, agentId))
                .to.be.revertedWith("Round is not Refunding");
        });

        it("Agent 소유자가 아닌 사용자는 환불할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [172800]);
            await ethers.provider.send("evm_mine");
            
            const agentId = 0;
            
            await expect(main.connect(user2).refund(1, agentId))
                .to.be.revertedWith("Mismatch (Agent & round)");
        });
    });

    describe("라운드 종료", function () {
        beforeEach(async function () {
            await main.connect(admin).startRound("0x");
        });

        it("admin이 라운드를 종료할 수 있어야 한다", async function () {
            // 라운드 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [259200]); // 72시간 증가
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).endRound(1);
            expect(await main.getRoundStatus(1)).to.equal(4); // Ended
        });

        it("admin이 아닌 계정은 라운드를 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [259200]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).endRound(1))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 NotStarted 상태면 종료할 수 없어야 한다", async function () {
            await expect(main.connect(admin).endRound(0))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });

        it("라운드가 이미 Ended 상태면 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [259200]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(admin).endRound(1))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });
    });
}); 