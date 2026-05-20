import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { TimesheetEntry, Project, UserProfile } from '../types';
import { format } from 'date-fns';

export async function exportTimesheetToExcel(
  data: TimesheetEntry[], 
  projects: Project[], 
  users: UserProfile[],
  t: (key: string) => string,
  lang: string,
  filename: string = 'timesheet_report.xlsx',
  selectedProjectId: string
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Timesheet', {
    views: [{ showGridLines: true }]
  });

  const project = projects.find(p => p.id === selectedProjectId);
  
  let managerName = '黃銘崇';
  if (project?.responsible_person) {
    managerName = project.responsible_person;
  } else if (project?.manager_id) {
    const mgr = users.find(u => u.uid === project.manager_id);
    if (mgr) managerName = mgr.full_name || managerName;
  }
  
  // Clean public- prefix from managerName manually if it appears
  managerName = managerName.replace(/^public-/, '');

  function getWorkContentColor(content: string | undefined): string | null {
    if (!content) return null;
    if (content.includes('做線')) return 'FFFCE4D6';
    if (content.includes('佈盤')) return 'FFD9EAD3';
    if (content.includes('做機台')) return 'FFC9DBF8';
    if (content.includes('點料')) return 'FFFDE5CD';
    if (content.includes('其他')) return 'FFD9D2E9';
    return null;
  }

  // Group data by date
  const groupedByDate: { [date: string]: TimesheetEntry[] } = {};
  data.forEach(entry => {
    if (!groupedByDate[entry.date]) {
      groupedByDate[entry.date] = [];
    }
    groupedByDate[entry.date].push(entry);
  });

  // Find max employees in a single day to determine column count
  const sortedDates = Object.keys(groupedByDate).sort();
  let maxEmployeesPerDay = 0;
  sortedDates.forEach(date => {
    maxEmployeesPerDay = Math.max(maxEmployeesPerDay, groupedByDate[date].length);
  });

  const displayEmployees = Math.max(1, maxEmployeesPerDay);
  const TC = 2 + (displayEmployees * 4);

  // --- Row 1-3: Main Header ---
  const mergeToCol = Math.max(1, TC - 4);
  worksheet.mergeCells(1, 1, 3, mergeToCol);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = "正易科技有限公司 專案工時統計表";
  titleCell.font = { name: 'Microsoft JhengHei', size: 20, bold: true };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // --- Owner & Stats block (Last 4 columns, Rows 1-3) ---
  worksheet.mergeCells(1, TC - 3, 1, TC - 2);
  const ownerLabelCell = worksheet.getCell(1, TC - 3);
  ownerLabelCell.value = "負責人";
  ownerLabelCell.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  ownerLabelCell.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(1, TC - 1, 1, TC);
  const ownerValueCell = worksheet.getCell(1, TC - 1);
  ownerValueCell.value = managerName;
  ownerValueCell.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  ownerValueCell.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(2, TC - 3, 2, TC - 2);
  const sumNLabel = worksheet.getCell(2, TC - 3);
  sumNLabel.value = "平日(全)";
  sumNLabel.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sumNLabel.alignment = { vertical: 'middle', horizontal: 'center' };

  worksheet.mergeCells(2, TC - 1, 2, TC);
  const sumNValue = worksheet.getCell(2, TC - 1);
  sumNValue.value = data.filter(e => e.status === 'APPROVED').reduce((sum, e) => sum + e.normal_h, 0);
  sumNValue.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sumNValue.alignment = { vertical: 'middle', horizontal: 'center' };

  const sum134Label = worksheet.getCell(3, TC - 3);
  sum134Label.value = "1.34(全)";
  sum134Label.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sum134Label.alignment = { vertical: 'middle', horizontal: 'center' };

  const sum134Value = worksheet.getCell(3, TC - 2);
  sum134Value.value = data.filter(e => e.status === 'APPROVED').reduce((sum, e) => sum + e.ot_134_h, 0);
  sum134Value.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sum134Value.alignment = { vertical: 'middle', horizontal: 'center' };

  const sum167Label = worksheet.getCell(3, TC - 1);
  sum167Label.value = "1.67(全)";
  sum167Label.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sum167Label.alignment = { vertical: 'middle', horizontal: 'center' };

  const sum167Value = worksheet.getCell(3, TC);
  sum167Value.value = data.filter(e => e.status === 'APPROVED').reduce((sum, e) => sum + e.ot_167_h, 0);
  sum167Value.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  sum167Value.alignment = { vertical: 'middle', horizontal: 'center' };

  for (let r = 1; r <= 3; r++) {
    for (let c = TC - 3; c <= TC; c++) {
      worksheet.getCell(r, c).border = {
        top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' }
      };
    }
  }

  // --- Row 4: Project Info ---
  worksheet.mergeCells(4, 1, 4, 3);
  const prjLabel = worksheet.getCell(4, 1);
  prjLabel.value = `專案名稱： ${project?.name || ''}`;
  prjLabel.font = { name: 'Microsoft JhengHei', size: 11, bold: true };
  prjLabel.alignment = { vertical: 'middle', horizontal: 'left' };
  prjLabel.border = { bottom: { style: 'medium' } };
  worksheet.getCell(4, 2).border = { bottom: { style: 'medium' } };
  worksheet.getCell(4, 3).border = { bottom: { style: 'medium' } };

  // --- Row 5: Table Headers ---
  const headerRow = worksheet.getRow(5);
  headerRow.height = 20;
  
  const hA = worksheet.getCell(5, 1); hA.value = "項目";
  const hB = worksheet.getCell(5, 2); hB.value = "日期";
  
  for (let i = 0; i < displayEmployees; i++) {
    const startCol = 3 + (i * 4);
    worksheet.getCell(5, startCol).value = "人員";
    worksheet.getCell(5, startCol + 1).value = "平日";
    worksheet.getCell(5, startCol + 2).value = "加班 1.34";
    worksheet.getCell(5, startCol + 3).value = "加班 1.67";
  }
  
  headerRow.eachCell((cell, colNum) => {
    if (colNum <= TC) {
      cell.font = { name: 'Microsoft JhengHei', bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    }
  });

  // --- Data Rows ---
  sortedDates.forEach((date, rowIndex) => {
    const rIdx = 6 + rowIndex;
    const row = worksheet.getRow(rIdx);
    row.height = 20;

    const cA = worksheet.getCell(rIdx, 1);
    cA.value = rowIndex + 1;
    
    const cB = worksheet.getCell(rIdx, 2);
    const dateObj = new Date(date);
    if (lang.startsWith('zh')) {
      cB.value = format(dateObj, 'MM/dd/yyyy');
    } else {
      cB.value = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
    }
    
    const dayEntries = groupedByDate[date];
    dayEntries.forEach((entry, eIdx) => {
      const startCol = 3 + (eIdx * 4);
      const user = users.find(u => u.uid === entry.user_id);
      
      let personName = (user?.full_name || entry.user_id).replace(/^public-/, '');
      const isApproved = entry.status === 'APPROVED';
      const cellName = worksheet.getCell(rIdx, startCol);
      const cellN = worksheet.getCell(rIdx, startCol + 1);
      const cell134 = worksheet.getCell(rIdx, startCol + 2);
      const cell167 = worksheet.getCell(rIdx, startCol + 3);

      cellName.value = personName + (!isApproved ? ` (${t(entry.status.toLowerCase())})` : '');
      cellN.value = isApproved ? entry.normal_h : 0;
      cell134.value = isApproved ? entry.ot_134_h : 0;
      cell167.value = isApproved ? entry.ot_167_h : 0;

      const color = getWorkContentColor(entry.work_content);
      if (color) {
        const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
        cellName.fill = fill as any;
        cellN.fill = fill as any;
        cell134.fill = fill as any;
        cell167.fill = fill as any;
      }
    });

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber <= TC) {
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Microsoft JhengHei', size: 10 };
      }
    });
  });

  // Adjust Column Widths
  worksheet.getColumn(1).width = 6;
  worksheet.getColumn(2).width = 10;
  for (let i = 0; i < displayEmployees; i++) {
    worksheet.getColumn(3 + (i * 4)).width = 11;
    worksheet.getColumn(3 + (i * 4) + 1).width = 11;
    worksheet.getColumn(3 + (i * 4) + 2).width = 11;
    worksheet.getColumn(3 + (i * 4) + 3).width = 11;
  }

  // Initial summary logic ended here, now we continue to Task Summary Sheet
  
  // --- Task Summary Sheet ---
  const taskSheet = workbook.addWorksheet(t('task_breakdown') || 'Task Summary');
  
  // Header
  taskSheet.mergeCells(1, 1, 1, 4);
  const taskTitle = taskSheet.getCell(1, 1);
  taskTitle.value = `${project?.name || ''} - ${t('task_breakdown')}`;
  taskTitle.font = { bold: true, size: 16 };
  taskTitle.alignment = { horizontal: 'center' };

  taskSheet.getRow(3).values = [t('employee_name'), t('work_content'), t('total') + ' (H)'];
  taskSheet.getRow(3).font = { bold: true };
  taskSheet.columns = [
    { header: t('employee_name'), key: 'name', width: 20 },
    { header: t('work_content'), key: 'task', width: 30 },
    { header: t('total') + ' (H)', key: 'hours', width: 15 }
  ];

  const taskMap: Record<string, number> = {};
  const workerTaskMap: Record<string, Record<string, number>> = {};
  
  data.filter(e => e.status === 'APPROVED').forEach(ts => {
    const hours = (ts.normal_h || 0) + (ts.ot_134_h || 0) + (ts.ot_167_h || 0);
    const taskName = ts.work_content || t('other');
    const worker = ts.full_name || '-';
    
    taskMap[taskName] = (taskMap[taskName] || 0) + hours;
    if (!workerTaskMap[worker]) workerTaskMap[worker] = {};
    workerTaskMap[worker][taskName] = (workerTaskMap[worker][taskName] || 0) + hours;
  });

  let currentRow = 4;
  // Per worker breakdown
  Object.entries(workerTaskMap).forEach(([worker, tasks]) => {
    Object.entries(tasks).forEach(([task, hours]) => {
      taskSheet.getRow(currentRow).values = [worker, task, hours.toFixed(1)];
      currentRow++;
    });
    currentRow++; // Gap
  });

  // Global Task Totals
  currentRow++;
  taskSheet.getCell(currentRow, 1).value = t('total');
  taskSheet.getCell(currentRow, 1).font = { bold: true };
  currentRow++;
  
  Object.entries(taskMap).forEach(([task, hours]) => {
    taskSheet.getRow(currentRow).values = ['', task, hours.toFixed(1)];
    currentRow++;
  });

  // Re-generate with both sheets
  const finalBuffer = await workbook.xlsx.writeBuffer();
  const finalBlob = new Blob([finalBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(finalBlob, filename);
}
