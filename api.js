require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
app.use(express.json()); // ให้โปรแกรมอ่านข้อมูลแบบ JSON ได้
// เพิ่มบรรทัดนี้ลงไป
app.get('/', (req, res) => {
    res.send('API Server is working perfectly!');
});

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
});

app.post('/api/payroll', async (req, res) => {
    const { empId, baseSalary, otHours } = req.body;

    try {
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
        const result = await processPayroll(empId, baseSalary, otHours);
        res.json({ status: 'success', message: 'จ่ายเงินสำเร็จ', amount: result });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// สั่งให้ Server เริ่มทำงาน
app.listen(3000, () => {
    console.log('🚀 API Server is running at http://localhost:3000');
});