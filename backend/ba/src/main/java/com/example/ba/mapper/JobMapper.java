/**
 * 文件说明：岗位信息表 Mapper。
 * 职责：通过 MyBatis 注解对 t_2025_multi_area_job_info 等表执行查询，
 *       提供岗位分页搜索、岗位数量统计、岗位详情与筛选项数据获取等能力。
 */
package com.example.ba.mapper;

import com.example.ba.pojo.JobInfo;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface JobMapper {

    @Select({
            "<script>",
            "SELECT",
            "  id, job_name, company_name, update_date, salary_range, location, industry, company_size, company_type, job_code, job_source_url",
            "FROM t_2025_multi_area_job_info",
            "<where>",
            "  <if test=\"keyword != null and keyword != ''\">",
            "    AND (job_name LIKE CONCAT('%', #{keyword}, '%') OR company_name LIKE CONCAT('%', #{keyword}, '%'))",
            "  </if>",
            "  <if test=\"location != null and location != ''\">",
            "    AND location LIKE CONCAT('%', #{location}, '%')",
            "  </if>",
            "  <if test=\"locations != null and locations.size > 0\">",
            "    AND (",
            "      <foreach collection='locations' item='loc' separator=' OR '>",
            "        location LIKE CONCAT('%', #{loc}, '%')",
            "      </foreach>",
            "    )",
            "  </if>",
            "  <if test=\"industry != null and industry != ''\">",
            "    AND industry LIKE CONCAT('%', #{industry}, '%')",
            "  </if>",
            "  <if test=\"companySize != null and companySize != ''\">",
            "    AND company_size = #{companySize}",
            "  </if>",
            "  <if test=\"companyType != null and companyType != ''\">",
            "    AND company_type = #{companyType}",
            "  </if>",
            "  <if test=\"salary != null and salary != ''\">",
            "    AND salary_range LIKE CONCAT('%', #{salary}, '%')",
            "  </if>",
            "</where>",
            "ORDER BY id DESC",
            "LIMIT #{limit} OFFSET #{offset}",
            "</script>"
    })
    List<JobInfo> selectJobs(
            @Param("keyword") String keyword,
            @Param("location") String location,
            @Param("locations") List<String> locations,
            @Param("industry") String industry,
            @Param("companySize") String companySize,
            @Param("companyType") String companyType,
            @Param("salary") String salary,
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    @Select({
            "<script>",
            "SELECT COUNT(1)",
            "FROM t_2025_multi_area_job_info",
            "<where>",
            "  <if test=\"keyword != null and keyword != ''\">",
            "    AND (job_name LIKE CONCAT('%', #{keyword}, '%') OR company_name LIKE CONCAT('%', #{keyword}, '%'))",
            "  </if>",
            "  <if test=\"location != null and location != ''\">",
            "    AND location LIKE CONCAT('%', #{location}, '%')",
            "  </if>",
            "  <if test=\"locations != null and locations.size > 0\">",
            "    AND (",
            "      <foreach collection='locations' item='loc' separator=' OR '>",
            "        location LIKE CONCAT('%', #{loc}, '%')",
            "      </foreach>",
            "    )",
            "  </if>",
            "  <if test=\"industry != null and industry != ''\">",
            "    AND industry LIKE CONCAT('%', #{industry}, '%')",
            "  </if>",
            "  <if test=\"companySize != null and companySize != ''\">",
            "    AND company_size = #{companySize}",
            "  </if>",
            "  <if test=\"companyType != null and companyType != ''\">",
            "    AND company_type = #{companyType}",
            "  </if>",
            "  <if test=\"salary != null and salary != ''\">",
            "    AND salary_range LIKE CONCAT('%', #{salary}, '%')",
            "  </if>",
            "</where>",
            "</script>"
    })
    int countJobs(
            @Param("keyword") String keyword,
            @Param("location") String location,
            @Param("locations") List<String> locations,
            @Param("industry") String industry,
            @Param("companySize") String companySize,
            @Param("companyType") String companyType,
            @Param("salary") String salary
    );

    @Select("SELECT * FROM t_2025_multi_area_job_info WHERE id = #{id}")
    JobInfo getById(@Param("id") int id);

    @Select({
            "<script>",
            "SELECT",
            "  id, job_name, company_name, update_date, salary_range, location, industry, company_size, company_type, job_code, job_source_url",
            "FROM t_2025_multi_area_job_info",
            "WHERE id IN",
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>",
            "  #{id}",
            "</foreach>",
            "</script>"
    })
    List<JobInfo> selectByIds(@Param("ids") List<Integer> ids);

    @Select("SELECT DISTINCT location FROM t_2025_multi_area_job_info WHERE location IS NOT NULL AND location <> '' ORDER BY location LIMIT 200")
    List<String> listLocations();

    @Select("SELECT DISTINCT industry FROM t_2025_multi_area_job_info WHERE industry IS NOT NULL AND industry <> '' ORDER BY industry LIMIT 200")
    List<String> listIndustries();

    @Select("SELECT DISTINCT company_size FROM t_2025_multi_area_job_info WHERE company_size IS NOT NULL AND company_size <> '' ORDER BY company_size LIMIT 200")
    List<String> listCompanySizes();

    @Select("SELECT DISTINCT company_type FROM t_2025_multi_area_job_info WHERE company_type IS NOT NULL AND company_type <> '' ORDER BY company_type LIMIT 200")
    List<String> listCompanyTypes();
}
