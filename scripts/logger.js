const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);

// BigInt를 문자열로 변환하는 함수
function bigIntReplacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

// 로그 포맷 설정
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: () => dayjs().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// 콘솔 포맷 설정
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: () => dayjs().utc().format('YYYY-MM-DD HH:mm:ss') + ' UTC'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta, bigIntReplacer)}`;
        }
        return msg;
    })
);

// 파일 로깅 설정 (UTC 00:00에 리셋)
const fileTransport = new DailyRotateFile({
    filename: path.join('logs', 'round-manager-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '15d', // 15일간 보관
    format: logFormat,
    utc: true, // UTC 시간 사용
    createSymlink: true,
    symlinkName: 'round-manager-current.log'
});

// winston 로거 생성
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        // 콘솔 출력
        new winston.transports.Console({
            format: consoleFormat
        }),
        // 파일 출력
        fileTransport
    ]
});

// logs 디렉토리 생성
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger; 