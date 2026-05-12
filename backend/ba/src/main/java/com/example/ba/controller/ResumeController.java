/**
 * 文件说明：简历解析控制器。
 * 职责：接收前端上传的简历文件，调用 ResumeParseService 解析为结构化结果并返回，用于前端自动回填表单。
 */
package com.example.ba.controller;

import com.example.ba.common.Result;
import com.example.ba.dto.ResumeParseResultDTO;
import com.example.ba.exception.BusinessException;
import com.example.ba.service.ResumeParseService;
import com.example.ba.utils.AuthContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/resume")
@CrossOrigin
public class ResumeController {

    @Autowired
    private ResumeParseService resumeParseService;

    @PostMapping("/parse")
    public Result<ResumeParseResultDTO> parse(@RequestParam("file") MultipartFile file) {
        Long userId = AuthContext.getUserId();
        if (userId == null) {
            throw new BusinessException("请先登录后再上传简历");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException("上传文件为空");
        }

        try {
            ResumeParseResultDTO dto = resumeParseService.parse(file);
            return Result.success(dto);
        } catch (Throwable e) {
            e.printStackTrace();
            throw new BusinessException("简历解析失败: " + e.getMessage(), e);
        }
    }

}
