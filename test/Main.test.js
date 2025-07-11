const { expect } = require("chai");
const { ethers } = require("hardhat");

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
        // await sttToken.mint(user1.address, ethers.parseEther("1000"));
        // await sttToken.mint(user2.address, ethers.parseEther("1000"));
        // await sttToken.mint(user3.address, ethers.parseEther("1000"));
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
                .to.be.revertedWith("Ownable: caller is not the owner");
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
                .to.be.revertedWith("Ownable: caller is not the owner");
            await expect(main.connect(user1).setCorporateAddress(user2.address))
                .to.be.revertedWith("Ownable: caller is not the owner");
            await expect(main.connect(user1).setOperationAddress(user2.address))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("라운드 관리", function () {
        beforeEach(async function () {
            // 라운드 시작을 위한 기본 설정
            await main.connect(admin).startRound("0x");
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
            // 라운드 시작
            await main.connect(admin).startRound("0x");
            
            // 사용자에게 ItemParts 지급
            await itemParts.mint(user1.address, 0, 0, 0, 0);
            await itemParts.mint(user1.address, 1, 0, 0, 0);
            await itemParts.mint(user1.address, 2, 0, 0, 0);
            await itemParts.mint(user1.address, 3, 0, 0, 0);
            await itemParts.mint(user1.address, 4, 0, 0, 0);
        });

        it("Agent를 구매할 수 있어야 한다", async function () {
            const itemPartsIds = [0, 1, 2, 3, 4];
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            
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
            
            await main.connect(user1).buyAgent(itemPartsIds, deadline, signature);
            
            // Agent가 민팅되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(1);
        });

        it("라운드가 진행중이 아니면 Agent를 구매할 수 없어야 한다", async function () {
            // 라운드를 종료 상태로 변경
            await main.connect(admin).endRound(1);
            
            const itemPartsIds = [0, 1, 2, 3, 4];
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWith("Round is not proceeding");
        });

        it("STT 잔액이 부족하면 Agent를 구매할 수 없어야 한다", async function () {
            // 사용자의 STT 잔액을 0으로 만듦
            await sttToken.connect(user1).transfer(ethers.ZeroAddress, await sttToken.balanceOf(user1.address));
            
            const itemPartsIds = [0, 1, 2, 3, 4];
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "InsufficientCoin");
        });

        it("올바르지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const itemPartsIds = [0, 1, 2, 3, 5]; // 잘못된 부위
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user1).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "InvalidParts");
        });

        it("소유하지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const itemPartsIds = [0, 1, 2, 3, 4];
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = "0x";
            
            await expect(main.connect(user2).buyAgent(itemPartsIds, deadline, signature))
                .to.be.revertedWithCustomError(main, "NotItemPartsOwner");
        });
    });

    describe("라운드 세일 종료", function () {
        beforeEach(async function () {
            await main.connect(admin).startRound("0x");
            
            // 사용자에게 Agent 지급
            await itemParts.mint(user1.address, 0, 0, 0, 0);
            await itemParts.mint(user1.address, 1, 0, 0, 0);
            await itemParts.mint(user1.address, 2, 0, 0, 0);
            await itemParts.mint(user1.address, 3, 0, 0, 0);
            await itemParts.mint(user1.address, 4, 0, 0, 0);
            
            const itemPartsIds = [0, 1, 2, 3, 4];
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
            await main.connect(admin).startRound("0x");
            
            // Agent 구매 및 세일 종료
            await itemParts.mint(user1.address, 0, 0, 0, 0);
            await itemParts.mint(user1.address, 1, 0, 0, 0);
            await itemParts.mint(user1.address, 2, 0, 0, 0);
            await itemParts.mint(user1.address, 3, 0, 0, 0);
            await itemParts.mint(user1.address, 4, 0, 0, 0);
            
            const itemPartsIds = [0, 1, 2, 3, 4];
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
            
            await main.connect(admin).settleRound(12345);
            expect(await main.getRoundStatus(1)).to.equal(2); // Claiming
        });

        it("admin이 아닌 계정은 라운드를 정산할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).settleRound(12345))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 Drawing 상태가 아니면 정산할 수 없어야 한다", async function () {
            await expect(main.connect(admin).settleRound(12345))
                .to.be.revertedWith("Round is not drawing");
        });
    });

    describe("당첨금 수령", function () {
        beforeEach(async function () {
            await main.connect(admin).startRound("0x");
            
            // Agent 구매 및 정산
            await itemParts.mint(user1.address, 0, 0, 0, 0);
            await itemParts.mint(user1.address, 1, 0, 0, 0);
            await itemParts.mint(user1.address, 2, 0, 0, 0);
            await itemParts.mint(user1.address, 3, 0, 0, 0);
            await itemParts.mint(user1.address, 4, 0, 0, 0);
            
            const itemPartsIds = [0, 1, 2, 3, 4];
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
            await main.connect(admin).settleRound(12345);
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
            await itemParts.mint(user2.address, 0, 1, 0, 0);
            await itemParts.mint(user2.address, 1, 1, 0, 0);
            await itemParts.mint(user2.address, 2, 1, 0, 0);
            await itemParts.mint(user2.address, 3, 1, 0, 0);
            await itemParts.mint(user2.address, 4, 1, 0, 0);
            
            const itemPartsIds = [5, 6, 7, 8, 9];
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
            await main.connect(admin).startRound("0x");
            
            // Agent 구매
            await itemParts.mint(user1.address, 0, 0, 0, 0);
            await itemParts.mint(user1.address, 1, 0, 0, 0);
            await itemParts.mint(user1.address, 2, 0, 0, 0);
            await itemParts.mint(user1.address, 3, 0, 0, 0);
            await itemParts.mint(user1.address, 4, 0, 0, 0);
            
            const itemPartsIds = [0, 1, 2, 3, 4];
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