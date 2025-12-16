using System;
using System.IO;

namespace Kutuphane.Api.Controllers
{
    public partial class RecordTypesController
    {
        /// <summary>
        /// ActivityLog action kodlarını Türkçe'ye çevirir
        /// </summary>
        private string TranslateAction(string action)
        {
            return action switch
            {
                "ADD_BOOK" => "Kitap Eklendi",
                "UPDATE_BOOK" => "Kitap Güncellendi",
                "DELETE_BOOK" => "Kitap Silindi",
                "ADD_STUDENT" => "Öğrenci Eklendi",
                "UPDATE_STUDENT" => "Öğrenci Güncellendi",
                "DELETE_STUDENT" => "Öğrenci Silindi",
                "ADD_PERSONEL" => "Personel Eklendi",
                "UPDATE_PERSONEL" => "Personel Güncellendi",
                "DELETE_PERSONEL" => "Personel Silindi",
                "LOAN_BOOK" => "Kitap Ödünç Verildi",
                "RETURN_BOOK" => "Kitap Teslim Alındı",
                "LOGIN" => "Giriş Yapıldı",
                _ => action
            };
        }
    }
}
