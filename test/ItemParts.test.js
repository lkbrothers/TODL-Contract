const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("ItemParts Contract", function () {
    let itemParts;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        
        // ItemPartsNFT 배포 (ethers v6 방식)
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        itemParts = await ItemParts.deploy(owner.address);
        await itemParts.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await itemParts.name()).to.equal("TODL ItemParts NFT");
            expect(await itemParts.symbol()).to.equal("PART");
        });
    });

    describe("민팅", function () {
        it("사용자가 ItemParts를 민팅할 수 있어야 한다", async function () {
            await itemParts.connect(user1).mint();
            
            expect(await itemParts.balanceOf(user1.address)).to.equal(1);
        });

        it("여러 개의 ItemParts를 민팅할 수 있어야 한다", async function () {
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
            
            expect(await itemParts.balanceOf(user1.address)).to.equal(5);
        });
    });

    describe("토큰 정보", function () {
        beforeEach(async function () {
            await itemParts.connect(user1).mint();
        });

        it("토큰 정보를 조회할 수 있어야 한다", async function () {
            const tokenInfo = await itemParts.tokenInfo(0);
            expect(tokenInfo.partsIndex).to.be.a('number');
            expect(tokenInfo.originsIndex).to.be.a('number');
            expect(tokenInfo.setNumsIndex).to.be.a('number');
        });

        it("존재하지 않는 토큰의 정보를 조회할 수 없어야 한다", async function () {
            await expect(itemParts.tokenInfo(999))
                .to.be.revertedWith("ERC721: invalid token ID");
        });
    });

    describe("소각", function () {
        beforeEach(async function () {
            await itemParts.connect(user1).mint();
        });

        it("토큰 소유자가 토큰을 소각할 수 있어야 한다", async function () {
            await itemParts.connect(user1).burn(user1.address, 0);
            
            await expect(itemParts.ownerOf(0))
                .to.be.revertedWith("ERC721: invalid token ID");
            expect(await itemParts.balanceOf(user1.address)).to.equal(0);
        });

        it("토큰 소유자가 아닌 계정은 소각할 수 없어야 한다", async function () {
            await expect(
                itemParts.connect(user2).burn(user1.address, 0)
            ).to.be.revertedWith("ERC721: caller is not token owner or approved");
        });

        it("존재하지 않는 토큰을 소각할 수 없어야 한다", async function () {
            await expect(
                itemParts.connect(user1).burn(user1.address, 999)
            ).to.be.revertedWith("ERC721: invalid token ID");
        });
    });

    describe("ERC721 표준 기능", function () {
        beforeEach(async function () {
            await itemParts.connect(user1).mint();
        });

        it("transfer가 정상적으로 작동해야 한다", async function () {
            await itemParts.connect(user1).transferFrom(user1.address, user2.address, 0);
            
            expect(await itemParts.ownerOf(0)).to.equal(user2.address);
            expect(await itemParts.balanceOf(user1.address)).to.equal(0);
            expect(await itemParts.balanceOf(user2.address)).to.equal(1);
        });

        it("approve가 정상적으로 작동해야 한다", async function () {
            await itemParts.connect(user1).approve(user2.address, 0);
            await itemParts.connect(user2).transferFrom(user1.address, user3.address, 0);
            
            expect(await itemParts.ownerOf(0)).to.equal(user3.address);
        });

        it("setApprovalForAll이 정상적으로 작동해야 한다", async function () {
            await itemParts.connect(user1).setApprovalForAll(user2.address, true);
            await itemParts.connect(user2).transferFrom(user1.address, user3.address, 0);
            
            expect(await itemParts.ownerOf(0)).to.equal(user3.address);
        });
    });

    describe("URI 관리", function () {
        it("baseURI를 설정할 수 있어야 한다", async function () {
            const baseURI = "https://api.todl.com/metadata/";
            await itemParts.setBaseURI(baseURI);
            
            expect(await itemParts.baseURI()).to.equal(baseURI);
        });

        it("owner가 아닌 계정은 baseURI를 설정할 수 없어야 한다", async function () {
            const baseURI = "https://api.todl.com/metadata/";
            await expect(
                itemParts.connect(user1).setBaseURI(baseURI)
            ).to.be.revertedWithCustomError(itemParts, "OwnableUnauthorizedAccount");
        });

        it("토큰 URI가 올바르게 반환되어야 한다", async function () {
            const baseURI = "https://api.todl.com/metadata/";
            await itemParts.setBaseURI(baseURI);
            await itemParts.connect(user1).mint();
            
            expect(await itemParts.tokenURI(0)).to.equal(baseURI + "0");
        });
    });
}); 