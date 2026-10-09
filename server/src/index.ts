import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db';

import metadataRoutes from './routes/metadata';
import recordRoutes from './routes/records';
import flowRoutes from './routes/flows';
import reportRoutes from './routes/reports';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Register All Platform API Engines
app.use('/api/metadata', metadataRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/reports', reportRoutes);

// Platform Health Endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      platform: 'MetaDrive Core',
      db_time: result.rows[0].now,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`MetaDrive Engine running on port ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=================================`);
});