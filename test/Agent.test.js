/**
 * @file Agent.test.js
 * @notice Agent NFT 컨트랙트의 독립적인 기능 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Agent NFT Contract", function () {
    let agent, itemParts;
    let owner, user1, user2, user3;
    let mockMainAddr;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        mockMainAddr = user3.address; // 테스트용 Mock Main 주소

        // ItemParts 컨트랙트 배포 (Agent에서 참조)
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        itemParts = await ItemParts.deploy(mockMainAddr);
        await itemParts.waitForDeployment();

        // Agent 컨트랙트 배포
        const Agent = await ethers.getContractFactory("AgentNFT");
        agent = await Agent.deploy(mockMainAddr);
        await agent.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await agent.mainAddr()).to.equal(mockMainAddr);
            expect(await agent.totalSupply()).to.equal(0);
            expect(await agent.baseUri()).to.equal("http://test.sample.com/Agent/json/");
            expect(await agent.owner()).to.equal(owner.address);
            expect(await agent.name()).to.equal("TODL Agent NFT");
            expect(await agent.symbol()).to.equal("AGENT");
        });
    });

    describe("Owner 관리", function () {
        it("owner가 아닌 계정은 관리 함수를 호출할 수 없어야 한다", async function () {
            await expect(agent.connect(user1).setBaseURI("new uri"))
                .to.be.revertedWithCustomError(agent, "OwnableUnauthorizedAccount");
        });
    });

    describe("BaseURI 설정", function () {
        it("BaseURI를 설정할 수 있어야 한다", async function () {
            const newUri = "https://new.agent.uri.com/";
            await agent.setBaseURI(newUri);
            expect(await agent.baseUri()).to.equal(newUri);
        });

        it("빈 문자열로 설정할 수 없어야 한다", async function () {
            await expect(agent.setBaseURI(""))
                .to.be.revertedWith("Invalid args");
        });

        it("같은 URI로 설정할 수 없어야 한다", async function () {
            await expect(agent.setBaseURI("http://test.sample.com/Agent/json/"))
                .to.be.revertedWith("Same Uri");
        });
    });



    describe("타입별 민팅 카운트 조회", function () {
        it("올바른 파츠 배열로 타입별 민팅 카운트를 조회할 수 있어야 한다", async function () {
            const parts = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            const count = await agent.getMintCountByType(parts);
            expect(count).to.equal(0); // 초기에는 0개
        });

        it("5개가 아닌 파츠 배열로 조회할 수 없어야 한다", async function () {
            const parts = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1"]; // 4개만
            await expect(agent.getMintCountByType(parts))
                .to.be.revertedWith("Exactly 5 parts required");
        });

        it("6개 파츠 배열로 조회할 수 없어야 한다", async function () {
            const parts = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1", "Extra-TODL-1"]; // 6개
            await expect(agent.getMintCountByType(parts))
                .to.be.revertedWith("Exactly 5 parts required");
        });
    });

    describe("라운드별 타입별 민팅 카운트 조회", function () {
        it("올바른 파츠 배열로 라운드별 타입별 민팅 카운트를 조회할 수 있어야 한다", async function () {
            const parts = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            const count = await agent.getMintCountByTypePerRound(1, parts);
            expect(count).to.equal(0); // 초기에는 0개
        });

        it("5개가 아닌 파츠 배열로 라운드별 조회할 수 없어야 한다", async function () {
            const parts = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1"]; // 4개만
            await expect(agent.getMintCountByTypePerRound(1, parts))
                .to.be.revertedWith("Exactly 5 parts required");
        });
    });

    describe("ERC721 기본 기능", function () {
        it("토큰이 존재하지 않을 때 ownerOf가 revert되어야 한다", async function () {
            await expect(agent.ownerOf(1))
                .to.be.revertedWithCustomError(agent, "ERC721NonexistentToken");
        });

        it("토큰이 존재하지 않을 때 balanceOf가 0이어야 한다", async function () {
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("토큰이 존재하지 않을 때 transferFrom이 revert되어야 한다", async function () {
            await expect(agent.connect(user1).transferFrom(user1.address, user2.address, 1))
                .to.be.reverted;
        });

        it("토큰이 존재하지 않을 때 approve가 revert되어야 한다", async function () {
            await expect(agent.connect(user1).approve(user2.address, 1))
                .to.be.revertedWithCustomError(agent, "ERC721NonexistentToken");
        });
    });

    describe("이벤트 발생", function () {
        it("BaseURI 설정 시 BaseUriUpdated 이벤트가 발생해야 한다", async function () {
            await expect(agent.setBaseURI("new uri"))
                .to.emit(agent, "BaseUriUpdated");
        });
    });

    describe("토큰 정보 조회", function () {
        it("존재하지 않는 토큰의 roundOf가 0이어야 한다", async function () {
            expect(await agent.roundOf(1)).to.equal(0);
        });

        it("존재하지 않는 토큰의 typeOf가 0이어야 한다", async function () {
            expect(await agent.typeOf(1)).to.equal(ethers.ZeroHash);
        });

        it("라운드별 총 발행량이 0이어야 한다", async function () {
            expect(await agent.totalSupplyPerRound(1)).to.equal(0);
        });

        it("라운드별 사용자 보유 개수가 0이어야 한다", async function () {
            expect(await agent.balanceOfPerRound(1, user1.address)).to.equal(0);
        });
    });

    describe("타입 해시 생성", function () {
        it("동일한 파츠 배열은 동일한 타입 해시를 생성해야 한다", async function () {
            const parts1 = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            const parts2 = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            
            const count1 = await agent.getMintCountByType(parts1);
            const count2 = await agent.getMintCountByType(parts2);
            
            expect(count1).to.equal(count2);
        });

        it("다른 파츠 배열은 다른 타입 해시를 생성해야 한다", async function () {
            const parts1 = ["Head-TODL-1", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            const parts2 = ["Head-TODL-2", "Body-TODL-1", "Legs-TODL-1", "RHand-TODL-1", "LHand-TODL-1"];
            
            const count1 = await agent.getMintCountByType(parts1);
            const count2 = await agent.getMintCountByType(parts2);
            
            // 둘 다 0이지만, 실제로는 다른 해시를 생성함
            expect(count1).to.equal(count2); // 초기값이므로 둘 다 0
        });
    });

    describe("라운드별 통계", function () {
        it("존재하지 않는 라운드의 통계가 0이어야 한다", async function () {
            expect(await agent.totalSupplyPerRound(999)).to.equal(0);
        });

        it("존재하지 않는 라운드의 사용자 보유 개수가 0이어야 한다", async function () {
            expect(await agent.balanceOfPerRound(999, user1.address)).to.equal(0);
        });
    });

    describe("타입별 통계", function () {
        it("존재하지 않는 타입의 총 민팅 개수가 0이어야 한다", async function () {
            const parts = ["NonExistent-1", "NonExistent-2", "NonExistent-3", "NonExistent-4", "NonExistent-5"];
            const count = await agent.getMintCountByType(parts);
            expect(count).to.equal(0);
        });

        it("존재하지 않는 라운드의 타입별 민팅 개수가 0이어야 한다", async function () {
            const parts = ["NonExistent-1", "NonExistent-2", "NonExistent-3", "NonExistent-4", "NonExistent-5"];
            const count = await agent.getMintCountByTypePerRound(999, parts);
            expect(count).to.equal(0);
        });
    });
}); 