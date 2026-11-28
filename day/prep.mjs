// Disney placement prep (Data Engineer, NITK campus drive, Dec 2026). References first, then the checklist.
// Each tick is a record 'dprep:<id>' in day.v1, so it syncs like everything else.
const S = q => 'https://www.udemy.com/courses/search/?q=' + encodeURIComponent(q);
const O = q => 'https://learning.oreilly.com/search/?q=' + encodeURIComponent(q);
const L = q => 'https://www.linkedin.com/learning/search?keywords=' + encodeURIComponent(q);

export const OA_DATE = '2026-12-02';

export const GROUPS = [
  { id: 'refs', title: '1. Read first: references', note: 'Search links open the right results on each platform; pick the top-rated, most recent one.', items: [
    { id: 'r-fde', t: 'Fundamentals of Data Engineering (Reis & Housley): ch. 1–3, 8', src: 'O’Reilly', url: O('Fundamentals of Data Engineering') },
    { id: 'r-kimball', t: 'The Data Warehouse Toolkit (Kimball): ch. 1–2, star schema, facts and dimensions', src: 'O’Reilly', url: O('The Data Warehouse Toolkit Kimball') },
    { id: 'r-spark', t: 'Learning Spark, 2nd ed.: ch. 1–4 (DataFrames, Spark SQL, lazy evaluation)', src: 'O’Reilly', url: O('Learning Spark 2nd edition') },
    { id: 'r-ddia', t: 'Designing Data-Intensive Applications: ch. 3 (storage) and ch. 10–11 (batch, streaming), skim', src: 'O’Reilly', url: O('Designing Data-Intensive Applications') },
    { id: 'u-sql', t: 'Advanced SQL / window functions course', src: 'Udemy', url: S('advanced SQL window functions') },
    { id: 'u-spark', t: 'PySpark for data engineering (hands-on)', src: 'Udemy', url: S('PySpark data engineering') },
    { id: 'u-etl', t: 'ETL and Airflow basics', src: 'Udemy', url: S('Apache Airflow ETL beginners') },
    { id: 'l-model', t: 'Data modeling: dimensional modeling and normalization', src: 'LinkedIn Learning', url: L('data modeling dimensional') },
    { id: 'l-de', t: 'Data engineering foundations', src: 'LinkedIn Learning', url: L('data engineering foundations') },
    { id: 'l-snow', t: 'Snowflake / Databricks first look (preferred skills)', src: 'LinkedIn Learning', url: L('Databricks Snowflake') },
    { id: 'p-sql50', t: 'Practice: LeetCode SQL 50', src: 'LeetCode', url: 'https://leetcode.com/studyplan/top-sql-50/' },
    { id: 'p-dl', t: 'Practice: DataLemur SQL interview questions', src: 'DataLemur', url: 'https://datalemur.com/questions' }
  ] },
  { id: 'now', title: '2. Do now', items: [
    { id: 'n-elig', t: 'Ask a secondary SPoC: is MTech CDS eligible? (CDS is listed only for BTech)' },
    { id: 'n-forms', t: 'Confirm IRIS and the Google Form (NITK email) both show submitted' },
    { id: 'n-jd2', t: 'Compare the Data Engineer JD with the Software JD and pick one role' },
    { id: 'n-oa', t: 'Watch the channel: OA from college or home?' }
  ] },
  { id: 'resume', title: '3. Resume for this role', items: [
    { id: 'c-sum', t: 'Summary in data pipeline / ETL terms, not only GenAI' },
    { id: 'c-kpit', t: 'KPIT bullet: telemetry ingestion → transform → AWS, say “streaming”' },
    { id: 'c-phil', t: 'Philips bullet: data-quality and mismatch checks' },
    { id: 'c-spark', t: 'Add Spark only after the PySpark course, once you can answer questions on it' }
  ] },
  { id: 'oa', title: '4. OA prep (2 Dec, 5 pm, 60 min)', items: [
    { id: 'o-joins', t: 'SQL: joins, GROUP BY / HAVING, subqueries' },
    { id: 'o-win', t: 'SQL: window functions (ROW_NUMBER, RANK, LAG), CTEs, top-N per group' },
    { id: 'o-dsa', t: 'Python DSA: arrays, hashing, strings, two pointers (easy–medium)' },
    { id: 'o-etl', t: 'Theory: ETL vs ELT, batch vs streaming, data quality checks' },
    { id: 'o-model', t: 'Theory: star vs snowflake schema, 1NF–3NF, facts vs dimensions' },
    { id: 'o-spark', t: 'Theory: Spark RDD vs DataFrame, lazy evaluation, partitions, shuffles' },
    { id: 'o-mock', t: 'One timed 60-minute mock (SQL + 2 coding problems)' }
  ] },
  { id: 'int', title: '5. Interviews (December)', items: [
    { id: 'i-proj', t: 'Explain one project as a data pipeline, start to finish, in 2 minutes' },
    { id: 'i-why', t: 'Why Disney, why data engineering, why leave industry for the MTech' },
    { id: 'i-design', t: 'Sketch a pipeline: streaming views → warehouse → dashboard' }
  ] }
];

export const ALL_IDS = GROUPS.flatMap(g => g.items.map(i => i.id));
