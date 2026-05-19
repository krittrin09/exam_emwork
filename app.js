// 1. นำเข้า dotenv เพื่อดึงข้อมูลจากไฟล์ .env มาใช้
require('dotenv').config();
const mysql = require('mysql2/promise');

// 2. สร้างระบบสระน้ำ (Connection Pool) เพื่อต่อ Database
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ฟังก์ชันตัวช่วย: ปัดเศษทศนิยม 2 ตำแหน่ง
function roundToTwoDecimals(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

// ฟังก์ชันหลัก: คำนวณและอัปเดตเงินเดือน
async function processPayroll(empId, baseSalary, otHours) {
    // 1. คำนวณคณิตศาสตร์
    const sso = baseSalary * 0.05;
    const otRate = (baseSalary / 30 / 8) * 1.5;
    const gross = baseSalary + (otHours * otRate);
    const net = gross - sso;

    // 2. ปัดเศษให้เป็นเงินจริงเฉพาะยอดที่จะเอาไปใช้ (net)
    // ลบตัวแปร finalGross และ finalSso ทิ้งไปแล้วเพื่อความสะอาดของโค้ด
    const finalNet = roundToTwoDecimals(net);

    const client = await db.getConnection();

    try {
        await client.query('BEGIN'); // เริ่ม Transaction

        // ล็อกข้อมูลพนักงานคนที่จะอัปเดต
        await client.query(
            `SELECT balance FROM salaries WHERE emp_id = ? FOR UPDATE`,
            [empId]
        );

        // อัปเดตยอดเงินสะสมเข้าตาราง salaries
        await client.query(
            `UPDATE salaries SET balance = balance + ? WHERE emp_id = ?`,
            [finalNet, empId]
        );

        // แก้คอมเมนต์ให้ตรงกับความจริง
        await client.query('COMMIT'); // ยืนยันการอัปเดตข้อมูลตาราง salaries
        
        console.log(`✅ จ่ายเงินพนักงานรหัส ${empId} สำเร็จ: ยอดสุทธิ ${finalNet} บาท`);
        return finalNet;

    } catch (error) {
        await client.query('ROLLBACK'); // ยกเลิกถ้าระบบพัง
        console.error("❌ เกิดข้อผิดพลาด ยกเลิกการจ่ายเงิน:", error.message);
        throw error;
    } finally {
        client.release(); // คืน Connection เสมอ
    }
}

// ==========================================
// จำลองการเรียกใช้งาน (ทดสอบรัน)
// ==========================================
async function test() {
    console.log("เริ่มกระบวนการจ่ายเงิน...");
    // จ่ายเงินให้พนักงานรหัส 1 เงินเดือน 15000 ทำ OT 10 ชั่วโมง
    await processPayroll(1, 15000, 10);
    
    // ปิดการเชื่อมต่อ Database เมื่อโปรแกรมทำงานจบ
    db.end(); 
}

// สั่งรันฟังก์ชันทดสอบ
test();