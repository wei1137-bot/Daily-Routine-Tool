import { createContext, useContext, type ReactNode } from 'react'
import type { EventStatus, EventType } from './domain/types'
import type { EventGroup } from './domain/event/eventUtils'

export type Language = 'en' | 'zh'

const messages = {
  en: {
    dashboard:'Dashboard', inbox:'Inbox', schedule:'Timetable', calendar:'Calendar', settings:'Settings', courses:'Courses', addCourse:'Add course',
    goodMorning:'Good morning', goodAfternoon:'Good afternoon', goodEvening:'Good evening', ahead:'Here’s what’s ahead across your courses.',
    addEvent:'Add event', addExam:'Add exam', hideCompleted:'Hide completed', upcomingExams:'Upcoming exams', noUpcomingExams:'No upcoming exams.',
    todayClasses:"Today's classes", noClassesToday:'No classes today.', show:'Show', hide:'Hide', allCourses:'All courses', noCoursesSelected:'No courses selected', coursesSelected:'{count} courses', noSelectedCourseExams:'No exams for the selected courses.',
    nothingOnList:'Nothing on your list', nothingOnListHint:'Add a deadline or turn off “Hide completed.”',
    today:'Today', tomorrow:'Tomorrow', next7Days:'Next 7 days', later:'Later', past:'Past',
    deadlines:'Deadlines', syllabus:'Syllabus', editCourse:'Edit course', courseSchedule:'Course schedule', deadlinesAndExams:'Deadlines and exams',
    upcoming:'Upcoming', overdue:'Overdue', completed:'Completed', noUpcomingRange:'No upcoming events in this range.', nothingOverdue:'Nothing overdue.', nothingCompleted:'Nothing completed yet.',
    twoWeeks:'2 weeks', oneMonth:'1 month', all:'All', personal:'Personal', notes:'Notes', notesPlaceholder:'Write anything you want to remember…',
    autosaves:'Autosaves locally', nextExam:'Next exam', noUpcomingExam:'No upcoming exam', sourceDocument:'Source document', courseSummary:'Course summary',
    summaryPlaceholder:'Important topics and course structure…', officeHours:'Office hours', attendancePolicy:'Attendance policy', latePolicy:'Late policy',
    saveSyllabus:'Save syllabus details', brightspaceSyllabus:'Brightspace syllabus', attachPdf:'Attach syllabus PDF', viewFullSyllabus:'Click to view full syllabus',
    clickReplace:'Click to replace', structuredData:'Structured data', grades:'Grades', gradeBreakdown:'Grade breakdown', scorePlanner:'Score planner', category:'Category', remove:'Remove', addCategory:'Add category',
    displayAs:'Display as', pointsShort:'pts', scorePlannerHint:'Plan a target and track progress for each grading category. Current score can be entered as points earned or points lost.',
    maxScore:'Max', targetScore:'Target', currentScore:'Current', earned:'Earned', lost:'Lost', maxTotal:'Maximum', targetTotal:'Target', currentEstimate:'Current estimate', gapToTarget:'To target', saveScorePlan:'Save score plan', addGradeCategoriesFirst:'Add grading categories on the Grade breakdown tab first.',
    total:'Total', saveGradeBreakdown:'Save grade breakdown', parsingStatus:'Parsing status', parserBrightspace:'Automatically downloaded and extracted from Brightspace. Review or edit any field, then save to keep your changes.',
    parserLocal:'Attached PDFs and structured fields stay local. Brightspace syllabi are extracted automatically during sync.', fullSyllabus:'Full syllabus',
    closeSyllabus:'Close syllabus', noSyllabus:'No syllabus content is available yet.', openPdf:'Open PDF', done:'Done',
    viewDetails:'Open details', noDetailsYet:'No details yet.', saveChanges:'Save changes', syllabusOverview:'Overview', syllabusContents:'Contents',
    title:'Title', course:'Course', type:'Type', dueDateTime:'Due date and time', status:'Status', source:'Source', viewOriginal:'View original extracted information',
    noOriginal:'No original source content is attached.', deleteEvent:'Delete event', cancel:'Cancel', saveEvent:'Save event', eventDetails:'Event details', reviewDetected:'Review detected event',
    courseCode:'Course code', term:'Term', courseName:'Course name', instructor:'Instructor', instructorName:'Instructor name', courseTimezone:'Course timezone',
    courseColor:'Course color', custom:'Custom', deleteCourse:'Delete course', saveCourse:'Save course',
    academicSchedule:'Academic schedule', calendarSubtitle:'Deadlines and exams across every course.', thisMonth:'Today', more:'more',
    nextWeekPlan:'Next 7-day plan', nextWeekPlanHint:'Arrange tasks due in the next two weeks.', openPlanner:'Open planner',
    plannerTitle:'Plan the next 7 days', plannerSubtitle:'Choose an execution day for tasks due within the next two weeks.',
    twoWeekTasks:'Tasks due in the next 2 weeks', unscheduled:'Unscheduled', dailyPlan:'Daily plan', due:'Due',
    noTasksToPlan:'No incomplete tasks are due in the next two weeks.', noTasksForDay:'No tasks planned.', savePlan:'Save plan', planned:'planned', saving:'Saving…',
    dragTaskHint:'Drag this task onto a day', dropTaskHere:'Drop to schedule here',
    preferences:'Preferences', settingsSubtitle:'Control local data and integration defaults.', general:'General', generalHint:'Defaults used for newly created courses and Dashboard behavior.',
    defaultTimezone:'Default course timezone', language:'Language', english:'English', chinese:'中文', appAccent:'App accent color', hideCompletedDefault:'Hide completed events by default',
    brightspaceHint:'Use a dedicated browser session to read your active courses, assignment folders, and quizzes. Passwords and MFA answers are never handled by Daily Routine.',
    brightspaceAddress:'Brightspace address', connected:'Connected', notConnected:'Not connected', lastSync:'Last successful sync', never:'Never', ready:'Ready', loginRequired:'Login required',
    connectRelogin:'Connect / re-login', syncNow:'Sync now', openLog:'Open log', disconnect:'Disconnect', dailyBrightspace:'Automatically refreshes at most once every 24 hours while Daily Routine is running.',
    gradescopeHint:'Sign in through a dedicated Gradescope browser window. Daily Routine stores the browser session locally and reads only current courses and student assignment due dates.',
    loginRelogin:'Login / re-login', dailyGradescope:'Automatically refreshes at most once every 24 hours after a successful Gradescope login.', diagnosticLog:'Diagnostic log',
    autoLogin:'Automatic login', autoLoginHint:'Use the saved encrypted credentials when the Gradescope session expires.', configureAutoLogin:'Set up automatic login',
    gradescopeEmail:'Gradescope email', gradescopePassword:'Gradescope password', saveAndLogin:'Save and log in', encryptedAccount:'Encrypted account', encryptionUnavailable:'Windows secure storage is unavailable.',
    emailImport:'Email import', email:'Email', emailImportHint:'Import manually by pasting Brightspace notifications', available:'Available', localData:'Local data', localDataHint:'Course data and imported deadlines stay on this computer.',
    sqliteDatabase:'SQLite database', demoData:'Demo data', coursesLoaded:'courses currently loaded', resetDemo:'Reset demo data',
    reviewQueue:'Review queue', inboxSubtitle:'Confirm extracted information before it enters your schedule.', detectedItems:'detected items', nothingAddedSilently:'Nothing is added silently.',
    possibleDuplicate:'Possible duplicate of', reviewBeforeConfirm:'Review before confirming.', ignore:'Ignore', edit:'Edit', confirm:'Confirm', inboxClear:'Inbox is clear',
    inboxClearHint:'Paste a notification email to detect deadlines that need review.', pasteEmail:'Paste email', pasteEmailHint:'Brightspace activity summaries are recognized locally. No email account or password is needed.',
    pastePlaceholder:'Paste a Brightspace notification email here…', useSample:'Use sample', detectDeadline:'Detect deadline', parsing:'Parsing…', unknownCourse:'Unknown course',
    notDone:'Not done', inProgress:'In progress', statusDone:'Done', assignment:'Assignment', quiz:'Quiz', exam:'Exam', lab:'Lab', project:'Project', discussion:'Discussion', reading:'Reading', lecture:'Lecture', officeHour:'Office hour', other:'Other',
    opening:'Opening Daily Routine…', addFirstCourse:'Add your first course', welcomeTitle:'Welcome to Daily Routine', welcomeSubtitle:'Set up your courses',
    onboardingBrightspace:'Connect Brightspace', onboardingBrightspaceHint:'Automatically import courses and deadlines', onboardingGradescope:'Connect Gradescope', onboardingGradescopeHint:'Import Gradescope courses and deadlines',
    onboardingManual:'Add manually', onboardingManualHint:'Create a course yourself', dismiss:'Dismiss', deleteCourseConfirm:'and all its events?', deleteEventConfirm:'Delete event?'
    ,weeklyPlan:'Weekly plan', scheduleSubtitle:'Import a timetable screenshot or build your weekly class schedule manually.', addClass:'Add class', importScheduleImage:'Import schedule image', recognizingSchedule:'Recognizing…', scheduleImageOnly:'Please choose a PNG, JPEG, or WebP image.', dropSchedule:'Drop a timetable image here', dropScheduleHint:'Course codes, weekdays, times, and rooms are recognized locally.', recognizedClasses:'Recognized classes', reviewSchedule:'Review timetable', saveSchedule:'Save timetable', scheduleSaved:'Timetable saved locally.', selectCourse:'Select course', day:'Day', startTime:'Start time', endTime:'End time', location:'Location', classType:'Class type', noClassesRecognized:'No classes were recognized. Try a clearer image or add a class manually.', monday:'Monday', tuesday:'Tuesday', wednesday:'Wednesday', thursday:'Thursday', friday:'Friday'
  },
  zh: {
    dashboard:'总览', inbox:'收件箱', schedule:'课程表', calendar:'日历', settings:'设置', courses:'课程', addCourse:'添加课程',
    goodMorning:'早上好', goodAfternoon:'下午好', goodEvening:'晚上好', ahead:'这是所有课程接下来需要处理的内容。',
    addEvent:'添加事项', addExam:'添加考试', hideCompleted:'隐藏已完成', upcomingExams:'即将到来的考试', noUpcomingExams:'暂无即将到来的考试。',
    todayClasses:'今日课程', noClassesToday:'今天没有课程。', show:'展示', hide:'收起', allCourses:'全部课程', noCoursesSelected:'未选择课程', coursesSelected:'已选 {count} 门', noSelectedCourseExams:'所选课程暂无考试。',
    nothingOnList:'目前没有事项', nothingOnListHint:'添加一个截止日期，或关闭“隐藏已完成”。',
    today:'今天', tomorrow:'明天', next7Days:'未来 7 天', later:'稍后', past:'过去',
    deadlines:'截止日期', syllabus:'课程大纲', editCourse:'编辑课程', courseSchedule:'课程日程', deadlinesAndExams:'截止日期与考试',
    upcoming:'即将到来', overdue:'已过期', completed:'已完成', noUpcomingRange:'该时间范围内没有事项。', nothingOverdue:'没有已过期事项。', nothingCompleted:'还没有已完成事项。',
    twoWeeks:'两周', oneMonth:'一个月', all:'全部', personal:'个人', notes:'笔记', notesPlaceholder:'记录任何需要记住的课程信息…',
    autosaves:'自动保存到本机', nextExam:'下一场考试', noUpcomingExam:'暂无考试', sourceDocument:'来源文档', courseSummary:'课程概述',
    summaryPlaceholder:'重要主题与课程结构…', officeHours:'答疑时间', attendancePolicy:'出勤政策', latePolicy:'迟交政策',
    saveSyllabus:'保存大纲信息', brightspaceSyllabus:'Brightspace 课程大纲', attachPdf:'添加课程大纲 PDF', viewFullSyllabus:'点击查看完整课程大纲',
    clickReplace:'点击替换', structuredData:'结构化数据', grades:'成绩', gradeBreakdown:'成绩构成', scorePlanner:'分数规划', category:'类别', remove:'移除', addCategory:'添加类别',
    displayAs:'显示方式', pointsShort:'分', scorePlannerHint:'为每个成绩划分设置满分与目标；“现在”既可以填写已得分，也可以填写已扣分。',
    maxScore:'满分', targetScore:'目标', currentScore:'现在', earned:'已得分', lost:'已扣分', maxTotal:'总满分', targetTotal:'总目标', currentEstimate:'当前估算', gapToTarget:'距目标', saveScorePlan:'保存分数规划', addGradeCategoriesFirst:'请先在“成绩构成”页添加成绩类别。',
    total:'合计', saveGradeBreakdown:'保存成绩构成', parsingStatus:'解析状态', parserBrightspace:'已从 Brightspace 自动下载并解析。你可以检查或修改字段，然后保存更改。',
    parserLocal:'添加的 PDF 与结构化字段保存在本机；同步时会自动解析 Brightspace 课程大纲。', fullSyllabus:'完整课程大纲',
    closeSyllabus:'关闭课程大纲', noSyllabus:'目前没有可显示的课程大纲内容。', openPdf:'打开 PDF', done:'完成',
    viewDetails:'打开查看', noDetailsYet:'暂无内容。', saveChanges:'保存修改', syllabusOverview:'课程概览', syllabusContents:'章节目录',
    title:'标题', course:'课程', type:'类型', dueDateTime:'截止日期与时间', status:'状态', source:'来源', viewOriginal:'查看原始提取信息',
    noOriginal:'没有关联的原始来源内容。', deleteEvent:'删除事项', cancel:'取消', saveEvent:'保存事项', eventDetails:'事项详情', reviewDetected:'检查识别结果',
    courseCode:'课程代码', term:'学期', courseName:'课程名称', instructor:'教师', instructorName:'教师姓名', courseTimezone:'课程时区',
    courseColor:'课程颜色', custom:'自定义', deleteCourse:'删除课程', saveCourse:'保存课程',
    academicSchedule:'学业日程', calendarSubtitle:'查看所有课程的截止日期和考试。', thisMonth:'今天', more:'项',
    nextWeekPlan:'下一周计划', nextWeekPlanHint:'安排未来两周内的任务。', openPlanner:'打开日程安排',
    plannerTitle:'安排未来 7 天', plannerSubtitle:'为未来两周内到期的任务选择执行日期。',
    twoWeekTasks:'未来两周内的任务', unscheduled:'暂不安排', dailyPlan:'每日安排', due:'截止',
    noTasksToPlan:'未来两周内没有未完成任务。', noTasksForDay:'当天暂无任务。', savePlan:'保存安排', planned:'已安排', saving:'保存中…',
    dragTaskHint:'拖动任务到左侧某一天', dropTaskHere:'松开即可安排到这里',
    preferences:'偏好设置', settingsSubtitle:'管理本地数据和集成的默认选项。', general:'通用', generalHint:'设置新课程与总览页面使用的默认选项。',
    defaultTimezone:'默认课程时区', language:'语言', english:'English', chinese:'中文', appAccent:'应用主题色', hideCompletedDefault:'默认隐藏已完成事项',
    brightspaceHint:'使用独立浏览器会话读取当前课程、作业目录与测验。Daily Routine 不会处理密码或 MFA 验证答案。',
    brightspaceAddress:'Brightspace 地址', connected:'已连接', notConnected:'未连接', lastSync:'上次成功同步', never:'从未', ready:'可用', loginRequired:'需要登录',
    connectRelogin:'连接／重新登录', syncNow:'立即同步', openLog:'打开日志', disconnect:'断开连接', dailyBrightspace:'Daily Routine 运行时，每 24 小时最多自动刷新一次。',
    gradescopeHint:'通过独立的 Gradescope 浏览器窗口登录。Daily Routine 只在本机保存浏览器会话，并读取当前课程与学生作业截止时间。',
    loginRelogin:'登录／重新登录', dailyGradescope:'成功登录 Gradescope 后，每 24 小时最多自动刷新一次。', diagnosticLog:'诊断日志',
    autoLogin:'自动登录', autoLoginHint:'Gradescope 会话失效时，使用已加密保存的凭据自动重新登录。', configureAutoLogin:'设置自动登录',
    gradescopeEmail:'Gradescope 邮箱', gradescopePassword:'Gradescope 密码', saveAndLogin:'保存并登录', encryptedAccount:'已加密账号', encryptionUnavailable:'Windows 安全存储不可用。',
    emailImport:'邮件导入', email:'邮件', emailImportHint:'粘贴 Brightspace 通知以手动导入', available:'可用', localData:'本地数据', localDataHint:'课程和导入的截止日期均保存在此电脑。',
    sqliteDatabase:'SQLite 数据库', demoData:'演示数据', coursesLoaded:'门课程已载入', resetDemo:'重置演示数据',
    reviewQueue:'待检查', inboxSubtitle:'确认识别结果后再加入日程。', detectedItems:'项待检查', nothingAddedSilently:'任何内容都不会在未确认时加入。',
    possibleDuplicate:'可能与以下事项重复：', reviewBeforeConfirm:'请确认后再添加。', ignore:'忽略', edit:'编辑', confirm:'确认', inboxClear:'收件箱为空',
    inboxClearHint:'粘贴通知邮件即可识别需要检查的截止日期。', pasteEmail:'粘贴邮件', pasteEmailHint:'Brightspace 活动摘要在本机识别，无需连接邮箱或提供密码。',
    pastePlaceholder:'在此粘贴 Brightspace 通知邮件…', useSample:'使用示例', detectDeadline:'识别截止日期', parsing:'正在解析…', unknownCourse:'未知课程',
    notDone:'未完成', inProgress:'进行中', statusDone:'已完成', assignment:'作业', quiz:'测验', exam:'考试', lab:'实验', project:'项目', discussion:'讨论', reading:'阅读', lecture:'课程', officeHour:'答疑时间', other:'其他',
    opening:'正在打开 Daily Routine…', addFirstCourse:'添加第一门课程', welcomeTitle:'欢迎使用 Daily Routine', welcomeSubtitle:'设置你的课程',
    onboardingBrightspace:'连接 Brightspace', onboardingBrightspaceHint:'自动导入课程和截止日期', onboardingGradescope:'连接 Gradescope', onboardingGradescopeHint:'导入 Gradescope 课程和截止日期',
    onboardingManual:'手动添加', onboardingManualHint:'自行创建一门课程', dismiss:'关闭', deleteCourseConfirm:'以及该课程的所有事项？', deleteEventConfirm:'删除该事项？'
    ,weeklyPlan:'每周安排', scheduleSubtitle:'上传课程表截图自动识别，也可以手动建立每周课程表。', addClass:'添加课程时段', importScheduleImage:'导入课程表图片', recognizingSchedule:'正在识别…', scheduleImageOnly:'请选择 PNG、JPEG 或 WebP 图片。', dropSchedule:'将课程表图片拖到这里', dropScheduleHint:'课程代码、星期、时间和教室均在本机识别。', recognizedClasses:'识别结果', reviewSchedule:'检查课程表', saveSchedule:'保存课程表', scheduleSaved:'课程表已保存到本机。', selectCourse:'选择课程', day:'星期', startTime:'开始时间', endTime:'结束时间', location:'教室', classType:'课程类型', noClassesRecognized:'没有识别到课程，请换一张更清晰的图片或手动添加。', monday:'星期一', tuesday:'星期二', wednesday:'星期三', thursday:'星期四', friday:'星期五'
  }
} as const

export type MessageKey = keyof typeof messages.en

const I18nContext = createContext<Language>('en')

export function I18nProvider({ language, children }: { language: Language; children: ReactNode }) {
  return <I18nContext.Provider value={language}>{children}</I18nContext.Provider>
}

export function tr(language: Language, key: MessageKey) {
  return messages[language][key]
}

const courseNames: Record<string, string> = {
  'programming in c':'C 语言编程',
  'elem linear algebra':'初等线性代数',
  'introduction to discrete mathematics':'离散数学导论',
  'introduction to behavioral neuroscience':'行为神经科学导论',
  'introduction to statistics':'统计学导论',
  'fall 2026 eaps 106 dis - merge':'电影中的地球科学'
}

export function useI18n() {
  const language = useContext(I18nContext)
  const t = (key: MessageKey) => tr(language, key)
  const courseName = (value: string) => language === 'zh' ? (courseNames[value.trim().toLowerCase()] ?? value) : value
  const termName = (value: string) => language === 'zh' ? value.replace(/\b(Fall|Spring|Summer)\s+(20\d{2})\b/i, (_all, season: string, year: string) => `${year}年${({ fall:'秋季', spring:'春季', summer:'夏季' } as Record<string,string>)[season.toLowerCase()]}`) : value
  const eventType = (value: EventType) => t(value === 'office_hour' ? 'officeHour' : value as MessageKey)
  const status = (value: EventStatus) => t(value === 'not_done' ? 'notDone' : value === 'in_progress' ? 'inProgress' : 'statusDone')
  const eventGroup = (value: EventGroup) => t(({ Today:'today', Tomorrow:'tomorrow', 'Next 7 days':'next7Days', Later:'later', Past:'past' } as const)[value])
  return { language, locale: language === 'zh' ? 'zh-CN' : 'en', t, courseName, termName, eventType, status, eventGroup }
}
