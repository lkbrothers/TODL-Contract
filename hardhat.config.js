require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: false,
    },
  },
  mocha: {
    timeout: 40000
  },
  networks: {
    hardhat: {
      loggingEnabled: false
    },
    LKtestnet: {
      url: `http://211.104.148.180:8545`,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
